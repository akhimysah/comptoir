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
};

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
export async function priceCart(store: Store, items: CartInput, code?: string | null): Promise<PricedCart> {
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
  const shippingCents =
    lines.length === 0 || (store.freeShippingFromCents > 0 && afterDiscount >= store.freeShippingFromCents) || store.freeShippingFromCents === 0
      ? 0
      : store.shippingCents;

  return {
    lines,
    subtotalCents,
    discountCents,
    discountCode,
    discountError,
    shippingCents,
    totalCents: afterDiscount + shippingCents,
    freeShippingFromCents: store.freeShippingFromCents,
    notices,
  };
}
