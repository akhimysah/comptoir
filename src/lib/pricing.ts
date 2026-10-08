import "server-only";
import type { Discount, Store } from "@prisma/client";
import { db } from "./db";
import { parseJson } from "./utils";

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
};

export type PricedCart = {
  lines: PricedLine[];
  subtotalCents: number;
  discountCents: number;
  discountCode: string | null;
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
    where: { id: { in: [...qty.keys()] }, product: { storeId: store.id, status: "active" } },
    include: { product: true },
  });

  const notices: string[] = [];
  const lines: PricedLine[] = [];
  for (const [variantId, wanted] of qty) {
    const v = variants.find((x) => x.id === variantId);
    if (!v) {
      notices.push("Un article de votre panier n'est plus disponible et a été retiré.");
      continue;
    }
    const quantity = Math.min(wanted, v.stock);
    if (quantity <= 0) {
      notices.push(`${v.product.title} est épuisé et a été retiré du panier.`);
      continue;
    }
    if (quantity < wanted) notices.push(`Il ne reste que ${v.stock} × ${v.product.title}.`);
    lines.push({
      variantId: v.id,
      productId: v.productId,
      productTitle: v.product.title,
      productHandle: v.product.handle,
      variantTitle: v.title,
      priceCents: v.priceCents,
      compareAtCents: v.compareAtCents,
      quantity,
      available: v.stock,
      image: parseJson<string[]>(v.product.images, [])[0] ?? null,
      hue: v.product.hue,
    });
  }

  const subtotalCents = lines.reduce((s, l) => s + l.priceCents * l.quantity, 0);

  let discountCents = 0;
  let discountCode: string | null = null;
  let discountError: string | null = null;
  const normalized = code?.trim().toUpperCase();
  if (normalized) {
    const d = await db.discount.findUnique({ where: { storeId_code: { storeId: store.id, code: normalized } } });
    discountError = discountProblem(d, subtotalCents);
    if (!discountError && d) {
      discountCents = discountAmount(d, subtotalCents);
      discountCode = d.code;
    }
  }

  const afterDiscount = subtotalCents - discountCents;
  const shipping = await computeShipping(store, afterDiscount, lines.length > 0, ship);
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
    discountError,
    ...shipping,
    giftCardCode,
    giftCardCents,
    giftCardBalanceCents,
    giftCardError,
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
