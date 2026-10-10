import "server-only";
import type { Discount, Store } from "@prisma/client";
import { db } from "./db";
import { parseJson } from "./utils";
import { exclVat, includedTax, reverseChargeApplies, vatRateFor } from "./tax";
import { splitCartId, subPrice } from "./subscriptions";
import { bundleComponents, bundleStock } from "./bundles";
import { loadProPricing, proPrice } from "./b2b";
import { dict, translate, type Locale } from "./i18n";

/** Messages montrés au client (panier, paiement), dans sa langue. */
const MSG = dict(
  {
    noCode: "Ce code promo n'existe pas.",
    notYet: "Ce code promo n'est pas encore actif.",
    expired: "Ce code promo a expiré.",
    maxUses: "Ce code promo a déjà été utilisé le nombre maximum de fois.",
    tooLow: "Le montant du panier est trop bas pour ce code.",
    noItems: "Ce code ne s'applique à aucun article de votre panier.",
    bxgy: (n: number) => `Ajoutez ${n} articles concernés au panier pour profiter de l'offre.`,
    removed: "Un article de votre panier n'est plus disponible et a été retiré.",
    soldOut: (t: string) => `${t} est épuisé et a été retiré du panier.`,
    onlyLeft: (n: number, t: string) => `Il ne reste que ${n} × ${t}.`,
    onlyLeftLine: (n: number, t: string) => `Il ne reste que ${n} × ${t} pour cette ligne.`,
    notEnough: (t: string) => `${t} n'est plus disponible en quantité suffisante et a été retiré.`,
    autoDiscount: "Remise automatique",
    giftNone: "Cette carte cadeau n'existe pas.",
    giftExpired: "Cette carte cadeau a expiré.",
    giftEmpty: "Cette carte cadeau est épuisée.",
    byEmail: "Envoi par e-mail",
    pickup: "Retrait en boutique",
    standard: "Livraison standard",
    noRate: (kg: number) => `Aucun mode de livraison ne correspond à ce panier (${kg.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} kg). Contactez-nous pour l'envoyer.`,
    noCountry: "Nous ne livrons pas encore dans ce pays.",
    chooseCountry: "Choisissez votre pays de livraison.",
  },
  {
    noCode: "This discount code doesn't exist.",
    notYet: "This discount code isn't active yet.",
    expired: "This discount code has expired.",
    maxUses: "This discount code has reached its usage limit.",
    tooLow: "Your cart total is too low for this code.",
    noItems: "This code doesn't apply to any item in your cart.",
    bxgy: (n: number) => `Add ${n} eligible items to your cart to get this offer.`,
    removed: "An item in your cart is no longer available and has been removed.",
    soldOut: (t: string) => `${t} is sold out and has been removed from your cart.`,
    onlyLeft: (n: number, t: string) => `Only ${n} × ${t} left.`,
    onlyLeftLine: (n: number, t: string) => `Only ${n} × ${t} left for this line.`,
    notEnough: (t: string) => `${t} is no longer available in sufficient quantity and has been removed.`,
    autoDiscount: "Automatic discount",
    giftNone: "This gift card doesn't exist.",
    giftExpired: "This gift card has expired.",
    giftEmpty: "This gift card has no balance left.",
    byEmail: "Delivered by email",
    pickup: "In-store pickup",
    standard: "Standard shipping",
    noRate: (kg: number) => `No shipping method is available for this cart (${kg.toLocaleString("en-GB", { maximumFractionDigits: 2 })} kg). Contact us to arrange delivery.`,
    noCountry: "We don't ship to this country yet.",
    chooseCountry: "Choose your shipping country.",
  },
);

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
  /** Livraison offerte cumulée avec la remise principale (comptée elle aussi). */
  shippingDiscountId?: string | null;
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
  /** Poids des articles à expédier, en grammes. */
  weightGrams?: number;
  /** Retrait en boutique proposé (adresse et consignes), ou null. */
  pickup?: { address: string; instructions: string } | null;
  giftCardCode: string | null;
  giftCardCents: number;
  giftCardBalanceCents: number;
  giftCardError: string | null;
  taxRateBps: number;
  taxCents: number;
  /** Liste de prix professionnels appliquée (client B2B connecté), ou null. */
  priceListName?: string | null;
  /** Vente hors taxes à un professionnel de l'UE (autoliquidation). */
  reverseCharge?: boolean;
};

export type ShippingChoice = { country?: string | null; rateId?: string | null };

export const normalizeGiftCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");

type DiscountLine = { productId: string; priceCents: number; quantity: number; isGiftCard: boolean };

/** Articles concernés par la remise : tout le panier, certaines collections ou certains produits (jamais les cartes cadeaux). */
export function eligibleLines<L extends DiscountLine>(d: Discount, lines: L[], collectionsOf: Map<string, Set<string>>) {
  const targets = new Set(parseJson<string[]>(d.targetIds, []));
  return lines.filter((l) => {
    if (l.isGiftCard) return false;
    if (d.appliesTo === "products") return targets.has(l.productId);
    if (d.appliesTo === "collections") return [...(collectionsOf.get(l.productId) ?? [])].some((c) => targets.has(c));
    return true;
  });
}

/** Montant de la remise sur les articles concernés. « Achetez X, obtenez Y » : pour chaque lot complet de X+Y articles, Y articles réduits, toujours les moins chers. */
export function discountAmount(d: Discount, lines: DiscountLine[]) {
  const base = lines.reduce((s, l) => s + l.priceCents * l.quantity, 0);
  if (d.type === "percent") return Math.min(base, Math.round((base * Math.min(d.value, 100)) / 100));
  if (d.type === "fixed") return Math.min(base, d.value);
  if (d.type === "bxgy") {
    const group = d.buyQty + d.getQty;
    if (d.buyQty < 1 || d.getQty < 1) return 0;
    // Comme Shopify : autant d'articles réduits que de lots complets, et ce sont toujours les moins chers du panier.
    const units = lines.flatMap((l) => Array<number>(l.quantity).fill(l.priceCents)).sort((a, b) => a - b);
    const reduced = Math.floor(units.length / group) * d.getQty;
    const off = units.slice(0, reduced).reduce((sum, u) => sum + Math.round((u * Math.min(d.value, 100)) / 100), 0);
    return Math.min(base, off);
  }
  return 0;
}

export function discountProblem(d: Discount | null, subtotalCents: number, eligible?: DiscountLine[], locale: Locale = "fr"): string | null {
  const t = MSG[locale];
  if (!d || !d.active) return t.noCode;
  if (d.startsAt && d.startsAt > new Date()) return t.notYet;
  if (d.endsAt && d.endsAt < new Date()) return t.expired;
  if (d.usageLimit !== null && d.usageCount >= d.usageLimit) return t.maxUses;
  if (subtotalCents < d.minSubtotalCents) return t.tooLow;
  if (eligible && !eligible.length && d.type !== "free_shipping") return t.noItems;
  if (eligible && d.type === "bxgy" && eligible.reduce((s, l) => s + l.quantity, 0) < d.buyQty + d.getQty) return t.bxgy(d.buyQty + d.getQty);
  return null;
}

/**
 * Recalcule toujours le panier côté serveur à partir de la base :
 * les prix envoyés par le navigateur ne sont jamais utilisés.
 */
export async function priceCart(store: Store, items: CartInput, code?: string | null, ship: ShippingChoice = {}, giftCode?: string | null, opts: { priceListId?: string | null; locale?: Locale; vatNumber?: string | null } = {}): Promise<PricedCart> {
  const locale = opts.locale ?? "fr";
  const t = MSG[locale];
  // Professionnel d'un autre pays de l'UE avec numéro de TVA : vente hors taxes (autoliquidation), jamais en retrait.
  const reverseCharge = ship.rateId !== PICKUP_ID && reverseChargeApplies(store, opts.vatNumber, ship.country);
  const ex = (c: number) => (reverseCharge ? exclVat(c, store.taxRateBps) : c);
  // Titre du produit dans la langue du client (messages seulement : les lignes gardent le titre d'origine).
  const titleOf = (p: { title: string; translations?: string }) => translate(p, locale, ["title"]).title;
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

  // Client professionnel : ses prix remplacent les prix publics (jamais pour les cartes cadeaux).
  const pro = await loadProPricing(store.id, opts.priceListId, variants.map((v) => v.id));

  const notices: string[] = [];
  const lines: PricedLine[] = [];
  for (const [variantId, wanted] of qty) {
    const ref = splitCartId(variantId);
    const v = variants.find((x) => x.id === ref.variantId);
    if (!v) {
      notices.push(t.removed);
      continue;
    }
    // Une carte cadeau n'a pas de stock.
    const quantity = v.product.isGiftCard || v.product.continueSelling ? wanted : Math.min(wanted, stockOf(v));
    if (quantity <= 0) {
      notices.push(t.soldOut(titleOf(v.product)));
      continue;
    }
    if (quantity < wanted) notices.push(t.onlyLeft(stockOf(v), titleOf(v.product)));
    const sub = ref.subscribe && v.product.subscriptionInterval ? v.product.subscriptionInterval : null;
    const base = v.product.isGiftCard ? v.priceCents : ex(proPrice(v.priceCents, v.id, pro));
    lines.push({
      variantId,
      baseVariantId: v.id,
      subscription: sub,
      productId: v.productId,
      productTitle: v.product.title,
      productHandle: v.product.handle,
      variantTitle: v.title,
      priceCents: sub ? subPrice(base, v.product.subscriptionDiscountBps) : base,
      compareAtCents: v.product.isGiftCard ? v.compareAtCents : (sub && v.product.subscriptionDiscountBps) || base < ex(v.priceCents) ? ex(v.priceCents) : v.compareAtCents && ex(v.compareAtCents),
      quantity,
      available: v.product.isGiftCard || v.product.continueSelling ? 99 : stockOf(v),
      image: (v.image ?? parseJson<string[]>(v.product.images, [])[0]) ?? null,
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
      notices.push(allowed > 0 ? t.onlyLeftLine(allowed, titleOf(v.product)) : t.notEnough(titleOf(v.product)));
      l.quantity = allowed;
    }
    for (const n of needs) stockLeft.set(n.id, (stockLeft.get(n.id) ?? 0) - allowed * n.per);
  }
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].quantity <= 0) lines.splice(i, 1);

  // Poids à expédier : celui de la variante, ou pour un lot sans poids propre, celui de ses composants.
  const partIds = [...bundles.values()].flat().map((p) => p.variantId);
  const partWeight = new Map((partIds.length ? await db.variant.findMany({ where: { id: { in: partIds } }, select: { id: true, weightGrams: true } }) : []).map((x) => [x.id, x.weightGrams]));
  const weightGrams = lines.reduce((sum, l) => {
    const v = variants.find((x) => x.id === l.baseVariantId);
    if (!v || v.product.isGiftCard) return sum;
    const w = v.weightGrams || (bundles.get(v.productId) ?? []).reduce((t, p) => t + (partWeight.get(p.variantId) ?? 0) * p.quantity, 0);
    return sum + w * l.quantity;
  }, 0);

  const subtotalCents = lines.reduce((s, l) => s + l.priceCents * l.quantity, 0);
  // Les remises ne s'appliquent pas aux cartes cadeaux achetées (comme sur Shopify).
  const giftItemsCents = lines.filter((l) => l.isGiftCard).reduce((s, l) => s + l.priceCents * l.quantity, 0);
  const discountable = subtotalCents - giftItemsCents;

  let discountCents = 0;
  let discountCode: string | null = null;
  let discountId: string | null = null;
  let discountError: string | null = null;
  let freeShipping = false;
  // Collections de chaque produit du panier (chargées seulement si une remise cible des collections).
  let collectionsOf: Map<string, Set<string>> | null = null;
  const membership = async () => {
    if (!collectionsOf) {
      const links = await db.productCollection.findMany({ where: { productId: { in: lines.map((l) => l.productId) } }, select: { productId: true, collectionId: true } });
      collectionsOf = new Map();
      for (const l of links) collectionsOf.set(l.productId, (collectionsOf.get(l.productId) ?? new Set()).add(l.collectionId));
    }
    return collectionsOf;
  };
  const evaluate = async (d: Discount) => {
    const eligible = eligibleLines(d, lines, d.appliesTo === "collections" ? await membership() : new Map());
    return { eligible, problem: discountProblem(d, discountable, eligible, locale), amount: discountAmount(d, eligible) };
  };
  const normalized = code?.trim().toUpperCase();
  let codeDiscount: Discount | null = null;
  let codeAmount = 0;
  if (normalized) {
    const d = await db.discount.findUnique({ where: { storeId_code: { storeId: store.id, code: normalized } } });
    if (!d || d.automatic) discountError = t.noCode;
    else {
      const r = await evaluate(d);
      discountError = r.problem;
      if (!discountError) { codeDiscount = d; codeAmount = r.amount; }
    }
  }
  // Remises automatiques : la meilleure sur les produits et la meilleure livraison offerte, évaluées séparément.
  let bestAmount: { d: Discount; amount: number } | null = null;
  let bestShipping: Discount | null = null;
  if (discountable > 0) {
    const autos = await db.discount.findMany({ where: { storeId: store.id, automatic: true, active: true } });
    for (const d of autos) {
      const r = await evaluate(d);
      if (r.problem) continue;
      if (d.type === "free_shipping") { if (!bestShipping || (d.combinesWithShipping && !bestShipping.combinesWithShipping)) bestShipping = d; continue; }
      if (r.amount > 0 && (!bestAmount || r.amount > bestAmount.amount)) bestAmount = { d, amount: r.amount };
    }
  }
  // Une remise sur les produits et une livraison offerte se cumulent si les deux l'autorisent ; sinon une seule s'applique.
  const label = (d: Discount) => (d.automatic ? d.title || t.autoDiscount : d.code);
  let amountDiscount: { d: Discount; amount: number } | null = null;
  let shippingDiscount: Discount | null = null;
  if (codeDiscount) {
    if (codeDiscount.type === "free_shipping") {
      shippingDiscount = codeDiscount;
      if (bestAmount && codeDiscount.combinesWithShipping && bestAmount.d.combinesWithShipping) amountDiscount = bestAmount;
    } else {
      amountDiscount = { d: codeDiscount, amount: codeAmount };
      if (bestShipping && codeDiscount.combinesWithShipping && bestShipping.combinesWithShipping) shippingDiscount = bestShipping;
    }
  } else if (bestAmount) {
    amountDiscount = bestAmount;
    if (bestShipping && bestAmount.d.combinesWithShipping && bestShipping.combinesWithShipping) shippingDiscount = bestShipping;
  } else if (bestShipping) {
    shippingDiscount = bestShipping;
  }
  if (amountDiscount) discountCents = amountDiscount.amount;
  if (shippingDiscount) freeShipping = true;
  const applied = [amountDiscount?.d, shippingDiscount].filter((d): d is Discount => Boolean(d));
  discountCode = applied.length ? applied.map(label).join(" + ") : null;
  discountId = applied[0]?.id ?? null;
  const shippingDiscountId = applied[1]?.id ?? null;

  const afterDiscount = subtotalCents - discountCents;
  const needsShipping = lines.some((l) => !l.isGiftCard);
  const shipping = needsShipping
    ? await computeShipping(store, afterDiscount - giftItemsCents, true, ship, weightGrams, locale)
    : { countries: null, shippingOptions: [], shippingRateId: null, shippingMethod: lines.length ? t.byEmail : "", shippingCents: 0, shippingError: null };
  if (freeShipping && !shipping.shippingError) {
    shipping.shippingCents = 0;
    shipping.shippingOptions = shipping.shippingOptions.map((o) => ({ ...o, priceCents: 0 }));
  }
  if (reverseCharge) {
    shipping.shippingCents = ex(shipping.shippingCents);
    shipping.shippingOptions = shipping.shippingOptions.filter((o) => o.id !== PICKUP_ID).map((o) => ({ ...o, priceCents: ex(o.priceCents) }));
  }
  const due = afterDiscount + shipping.shippingCents;
  // TVA : celle du pays de livraison si la boutique l'a choisi (retrait en boutique : pays de la boutique) ; aucune en autoliquidation.
  const vatBps = reverseCharge ? 0 : !needsShipping || shipping.shippingRateId === PICKUP_ID ? store.taxRateBps : vatRateFor(store, ship.country);

  // Carte cadeau : elle paie tout ou partie du total, livraison comprise.
  let giftCardCode: string | null = null, giftCardCents = 0, giftCardBalanceCents = 0, giftCardError: string | null = null;
  const g = giftCode ? normalizeGiftCode(giftCode) : "";
  if (g) {
    const card = await db.giftCard.findUnique({ where: { storeId_code: { storeId: store.id, code: g } } });
    if (!card || card.disabled) giftCardError = t.giftNone;
    else if (card.expiresAt && card.expiresAt < new Date()) giftCardError = t.giftExpired;
    else if (card.balanceCents <= 0) giftCardError = t.giftEmpty;
    else { giftCardCode = card.code; giftCardBalanceCents = card.balanceCents; giftCardCents = Math.min(card.balanceCents, due); }
  }

  return {
    lines,
    subtotalCents,
    discountCents,
    discountCode,
    discountId,
    shippingDiscountId,
    discountError,
    ...shipping,
    giftCardCode,
    giftCardCents,
    giftCardBalanceCents,
    giftCardError,
    taxRateBps: vatBps,
    // La vente d'une carte cadeau n'est pas soumise à la TVA : elle l'est quand la carte est utilisée.
    taxCents: includedTax(due - giftItemsCents, vatBps),
    totalCents: due - giftCardCents,
    freeShippingFromCents: store.freeShippingFromCents,
    weightGrams,
    notices,
    priceListName: pro?.name ?? null,
    reverseCharge,
    pickup: store.pickupEnabled && store.pickupAddress.trim() && needsShipping ? { address: store.pickupAddress, instructions: store.pickupInstructions } : null,
  };
}

/** Tarifs selon les zones d'expédition, ou tarif unique de la boutique s'il n'y a pas de zone. */
export const PICKUP_ID = "pickup";

/** Livraison, plus le retrait en boutique (gratuit, sans adresse ni pays) quand la boutique le propose. */
async function computeShipping(store: Store, amount: number, hasItems: boolean, ship: ShippingChoice, weightGrams = 0, locale: Locale = "fr") {
  const base = await computeDelivery(store, amount, hasItems, ship, weightGrams, locale);
  if (!store.pickupEnabled || !store.pickupAddress.trim()) return base;
  const pickup = { id: PICKUP_ID, name: MSG[locale].pickup, priceCents: 0 };
  if (ship.rateId === PICKUP_ID) return { ...base, shippingOptions: [...base.shippingOptions, pickup], shippingRateId: PICKUP_ID, shippingMethod: pickup.name, shippingCents: 0, shippingError: null };
  return { ...base, shippingOptions: [...base.shippingOptions, pickup] };
}

/** Un tarif s'applique-t-il à ce panier (poids et montant dans ses bornes, incluses) ? */
export function rateMatches(r: { minWeightGrams: number | null; maxWeightGrams: number | null; minSubtotalCents: number | null; maxSubtotalCents: number | null }, weightGrams: number, amount: number) {
  return (r.minWeightGrams === null || weightGrams >= r.minWeightGrams) && (r.maxWeightGrams === null || weightGrams <= r.maxWeightGrams)
    && (r.minSubtotalCents === null || amount >= r.minSubtotalCents) && (r.maxSubtotalCents === null || amount <= r.maxSubtotalCents);
}

async function computeDelivery(store: Store, amount: number, hasItems: boolean, ship: ShippingChoice, weightGrams = 0, locale: Locale = "fr") {
  const t = MSG[locale];
  const zones = await db.shippingZone.findMany({ where: { storeId: store.id }, include: { rates: { orderBy: { position: "asc" } } } });
  if (!zones.length) {
    const free = !hasItems || store.freeShippingFromCents === 0 || amount >= store.freeShippingFromCents;
    const priceCents = free ? 0 : store.shippingCents;
    return { countries: null, shippingOptions: [{ id: "default", name: t.standard, priceCents }], shippingRateId: "default", shippingMethod: t.standard, shippingCents: priceCents, shippingError: null };
  }
  const countries = [...new Set(zones.flatMap((z) => parseJson<string[]>(z.countries, [])))].sort((a, b) => a.localeCompare(b, "fr"));
  const zone = ship.country ? zones.find((z) => parseJson<string[]>(z.countries, []).includes(ship.country!)) : null;
  if (zone && zone.rates.length) {
    // Seuls les tarifs dont les conditions (poids, montant) correspondent au panier sont proposés.
    const rates = zone.rates.filter((r) => rateMatches(r, weightGrams, amount));
    if (!rates.length) return { countries, shippingOptions: [], shippingRateId: null, shippingMethod: "", shippingCents: 0, shippingError: t.noRate(weightGrams / 1000) };
    zone.rates = rates;
  }
  if (!zone || !zone.rates.length) {
    return { countries, shippingOptions: [], shippingRateId: null, shippingMethod: "", shippingCents: 0, shippingError: ship.country ? t.noCountry : t.chooseCountry };
  }
  const options = zone.rates.map((r) => ({ id: r.id, name: r.name, priceCents: !hasItems || (r.freeAboveCents !== null && amount >= r.freeAboveCents) ? 0 : r.priceCents }));
  const chosen = options.find((o) => o.id === ship.rateId) ?? options.reduce((a, b) => (b.priceCents < a.priceCents ? b : a));
  return { countries, shippingOptions: options, shippingRateId: chosen.id, shippingMethod: chosen.name, shippingCents: chosen.priceCents, shippingError: null };
}
