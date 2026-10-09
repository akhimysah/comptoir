import "server-only";
import type { Discount, Store } from "@prisma/client";
import { db } from "./db";
import { parseJson } from "./utils";
import { includedTax } from "./tax";
import { splitCartId, subPrice } from "./subscriptions";
import { bundleComponents, bundleStock } from "./bundles";

export type CartInput = { variantId: string; quantity: number }[];

export type PricedLine = {
  variantId: string;
  productId: string;
  productTitle: string;
  productHandle: string;
  variantTitle: string;
  priceCents: number;
  compareAtCents: number | null;
  quantity: number;
  available: number;
  image: string | null;
  hue: number;
  isGiftCard: boolean;
  /** Identifiant réel de la variante (variantId peut porter le suffixe d'abonnement du panier). */
  baseVariantId: string;
  subscription: string | null;
};

export type PricedCart = {
  lines: PricedLine[];
  subtotalCents: number;
  discountCents: number;
  discountCode: string | null;
  /** Remise réellement appliquée (pour réserver et compter ses utilisations). */
  discountId: string | null;
  discountError: string | null;
  shippingCents: number;
  totalCents: number;
  freeShippingFromCents: number;
  /** Messages pour le client : article retiré, quantité réduite… */
  notices: string[];
  /** Pays livrés (null = la boutique n'a pas de zones : tarif unique, tous pays). */
  countries: string[] | null;
  shippingOptions: { id: string; name: string; priceCents: number }[];
  shippingRateId: string | null;
  shippingMethod: string;
  shippingError: string | null;
  giftCardCode: string | null;
  giftCardCents: number;
  giftCardBalanceCents: number;
  giftCardError: string | null;
  taxRateBps: number;
  taxCents: number;
};

export type ShippingChoice = { country?: string | null; rateId?: string | null };

export const normalizeGiftCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function discountAmount(d: Discount, subtotalCents: number) {
  const raw = d.type === "percent" ? Math.round((subtotalCents * Math.min(d.value, 100)) / 100) : d.value;
  return Math.min(raw, subtotalCents);
}

export function discountProblem(d: Discount | null, subtotalCents: number): string | null {
  if (!d || !d.active) return "Ce code promo n'existe pas.";
  if (d.endsAt && d.endsAt < new Date()) return "Ce code promo a expiré.";
  if (d.usageLimit !== null && d.usageCount >= d.usageLimit) return "Ce code promo a déjà été utilisé le nombre maximum de fois.";
  if (subtotalCents < d.minSubtotalCents) return "Le montant du panier est trop bas pour ce code.";
  return null;
}

/**
 * Recalcule toujours le panier côté serveur à partir de la base :
 * les prix envoyés par le navigateur ne sont jamais utilisés.
 */
export async function priceCart(store: Store, items: CartInput, code?: string | null, ship: ShippingChoice = {}, giftCode?: string | null): Promise<PricedCart> {
  const qty = new Map<string, number>();
  for (const it of items) {
    if (!it || typeof it.variantId !== "string") continue;
    const q = Math.max(0, Math.min(99, Math.floor(Number(it.quantity) || 0)));
    if (q > 0) qty.set(it.variantId, (qty.get(it.variantId) ?? 0) + q);
  }

  const variants = await db.variant.findMany({
    where: { id: { in: [...qty.keys()].map((k) => splitCartId(k).variantId) }, product: { storeId: store.id, status: "active" } },
    include: { product: true },
  });

  // Un lot n'a pas de stock propre : il dépend de celui de ses composants.
  const bundles = await bundleComponents([...new Set(variants.map((v) => v.productId))]);
  const stockOf = (v: (typeof variants)[number]) => (bundles.has(v.productId) ? bundleStock(bundles.get(v.productId)!) : v.stock);

  const notices: string[] = [];
  const lines: PricedLine[] = [];
  for (const [variantId, wanted] of qty) {
    const ref = splitCartId(variantId);
    const v = variants.find((x) => x.id === ref.variantId);
    if (!v) {
      notices.push("Un article de votre panier n'est plus disponible et a été retiré.");
      continue;
    }
    // Une carte cadeau n'a pas de stock.
    const quantity = v.product.isGiftCard || v.product.continueSelling ? wanted : Math.min(wanted, stockOf(v));
    if (quantity <= 0) {
      notices.push(`${v.product.title} est épuisé et a été retiré du panier.`);
      continue;
    }
    if (quantity < wanted) notices.push(`Il ne reste que ${stockOf(v)} × ${v.product.title}.`);
    const sub = ref.subscribe && v.product.subscriptionInterval ? v.product.subscriptionInterval : null;
    lines.push({
      variantId,
      baseVariantId: v.id,
      subscription: sub,
      productId: v.productId,
      productTitle: v.product.title,
      productHandle: v.product.handle,
      variantTitle: v.title,
      priceCents: sub ? subPrice(v.priceCents, v.product.subscriptionDiscountBps) : v.priceCents,
      compareAtCents: sub && v.product.subscriptionDiscountBps ? v.priceCents : v.compareAtCents,
      quantity,
      available: v.product.isGiftCard || v.product.continueSelling ? 99 : stockOf(v),
      image: parseJson<string[]>(v.product.images, [])[0] ?? null,
      hue: v.product.hue,
      isGiftCard: v.product.isGiftCard,
    });
  }

  // Stock vérifié sur l'ensemble du panier : une même variante peut apparaître en achat unique, en abonnement
  // ou dans un lot ; on additionne les besoins par variante réelle avant de valider chaque ligne.
  const stockLeft = new Map<string, number>();
  for (const v of variants) stockLeft.set(v.id, v.stock);
  for (const parts of bundles.values()) for (const p of parts) if (!stockLeft.has(p.variantId)) stockLeft.set(p.variantId, p.stock);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const v = variants.find((x) => x.id === l.baseVariantId)!;
    if (v.product.isGiftCard || v.product.continueSelling) continue;
    const needs = bundles.has(v.productId) ? bundles.get(v.productId)!.map((p) => ({ id: p.variantId, per: Math.max(1, p.quantity) })) : [{ id: v.id, per: 1 }];
    const allowed = Math.min(l.quantity, ...needs.map((n) => Math.floor(Math.max(0, stockLeft.get(n.id) ?? 0) / n.per)));
    if (allowed < l.quantity) {
      notices.push(allowed > 0 ? `Il ne reste que ${allowed} × ${l.productTitle} pour cette ligne.` : `${l.productTitle} n'est plus disponible en quantité suffisante et a été retiré.`);
      l.quantity = allowed;
    }
    for (const n of needs) stockLeft.set(n.id, (stockLeft.get(n.id) ?? 0) - allowed * n.per);
  }
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].quantity <= 0) lines.splice(i, 1);

  const subtotalCents = lines.reduce((s, l) => s + l.priceCents * l.quantity, 0);
  // Les remises ne s'appliquent pas aux cartes cadeaux achetées (comme sur Shopify).
  const giftItemsCents = lines.filter((l) => l.isGiftCard).reduce((s, l) => s + l.priceCents * l.quantity, 0);
  const discountable = subtotalCents - giftItemsCents;

  let discountCents = 0;
  let discountCode: string | null = null;
  let discountId: string | null = null;
  let discountError: string | null = null;
  let freeShipping = false;
  const normalized = code?.trim().toUpperCase();
  if (normalized) {
    const d = await db.discount.findUnique({ where: { storeId_code: { storeId: store.id, code: normalized } } });
    discountError = d?.automatic ? "Ce code promo n'existe pas." : discountProblem(d, discountable);
    if (!discountError && d) {
      if (d.type === "free_shipping") freeShipping = true;
      else discountCents = discountAmount(d, discountable);
      discountCode = d.code;
      discountId = d.id;
    }
  }
  // Remise automatique : la plus avantageuse, si aucun code n'est appliqué.
  if (!discountCode && discountable > 0) {
    const autos = await db.discount.findMany({ where: { storeId: store.id, automatic: true, active: true } });
    let best: { d: (typeof autos)[number]; amount: number } | null = null;
    for (const d of autos) {
      if (discountProblem(d, discountable)) continue;
      const amount = d.type === "free_shipping" ? 0 : discountAmount(d, discountable);
      if (!best || amount > best.amount || (amount === best.amount && d.type === "free_shipping")) best = { d, amount };
    }
    if (best) {
      discountCode = best.d.title || "Remise automatique";
      discountId = best.d.id;
      if (best.d.type === "free_shipping") freeShipping = true;
      else discountCents = best.amount;
    }
  }

  const afterDiscount = subtotalCents - discountCents;
  const needsShipping = lines.some((l) => !l.isGiftCard);
  const shipping = needsShipping
    ? await computeShipping(store, afterDiscount - giftItemsCents, true, ship)
    : { countries: null, shippingOptions: [], shippingRateId: null, shippingMethod: lines.length ? "Envoi par e-mail" : "", shippingCents: 0, shippingError: null };
  if (freeShipping && !shipping.shippingError) {
    shipping.shippingCents = 0;
    shipping.shippingOptions = shipping.shippingOptions.map((o) => ({ ...o, priceCents: 0 }));
  }
  const due = afterDiscount + shipping.shippingCents;

  // Carte cadeau : elle paie tout ou partie du total, livraison comprise.
  let giftCardCode: string | null = null, giftCardCents = 0, giftCardBalanceCents = 0, giftCardError: string | null = null;
  const g = giftCode ? normalizeGiftCode(giftCode) : "";
  if (g) {
    const card = await db.giftCard.findUnique({ where: { storeId_code: { storeId: store.id, code: g } } });
    if (!card || card.disabled) giftCardError = "Cette carte cadeau n'existe pas.";
    else if (card.expiresAt && card.expiresAt < new Date()) giftCardError = "Cette carte cadeau a expiré.";
    else if (card.balanceCents <= 0) giftCardError = "Cette carte cadeau est épuisée.";
    else { giftCardCode = card.code; giftCardBalanceCents = card.balanceCents; giftCardCents = Math.min(card.balanceCents, due); }
  }

  return {
    lines,
    subtotalCents,
    discountCents,
    discountCode,
    discountId,
    discountError,
    ...shipping,
    giftCardCode,
    giftCardCents,
    giftCardBalanceCents,
    giftCardError,
    taxRateBps: store.taxRateBps,
    // La vente d'une carte cadeau n'est pas soumise à la TVA : elle l'est quand la carte est utilisée.
    taxCents: includedTax(due - giftItemsCents, store.taxRateBps),
    totalCents: due - giftCardCents,
    freeShippingFromCents: store.freeShippingFromCents,
    notices,
  };
}

/** Tarifs selon les zones d'expédition, ou tarif unique de la boutique s'il n'y a pas de zone. */
async function computeShipping(store: Store, amount: number, hasItems: boolean, ship: ShippingChoice) {
  const zones = await db.shippingZone.findMany({ where: { storeId: store.id }, include: { rates: { orderBy: { position: "asc" } } } });
  if (!zones.length) {
    const free = !hasItems || store.freeShippingFromCents === 0 || amount >= store.freeShippingFromCents;
    const priceCents = free ? 0 : store.shippingCents;
    return { countries: null, shippingOptions: [{ id: "default", name: "Livraison standard", priceCents }], shippingRateId: "default", shippingMethod: "Livraison standard", shippingCents: priceCents, shippingError: null };
  }
  const countries = [...new Set(zones.flatMap((z) => parseJson<string[]>(z.countries, [])))].sort((a, b) => a.localeCompare(b, "fr"));
  const zone = ship.country ? zones.find((z) => parseJson<string[]>(z.countries, []).includes(ship.country!)) : null;
  if (!zone || !zone.rates.length) {
    return { countries, shippingOptions: [], shippingRateId: null, shippingMethod: "", shippingCents: 0, shippingError: ship.country ? "Nous ne livrons pas encore dans ce pays." : "Choisissez votre pays de livraison." };
  }
  const options = zone.rates.map((r) => ({ id: r.id, name: r.name, priceCents: !hasItems || (r.freeAboveCents !== null && amount >= r.freeAboveCents) ? 0 : r.priceCents }));
  const chosen = options.find((o) => o.id === ship.rateId) ?? options.reduce((a, b) => (b.priceCents < a.priceCents ? b : a));
  return { countries, shippingOptions: options, shippingRateId: chosen.id, shippingMethod: chosen.name, shippingCents: chosen.priceCents, shippingError: null };
}
