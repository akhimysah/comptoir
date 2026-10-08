"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseMoney } from "@/lib/money";
import { createOrder, markOrderPaid } from "@/lib/orders";
import type { PricedCart } from "@/lib/pricing";
import { parseJson } from "@/lib/utils";

const schema = z.object({
  lines: z.array(z.object({ variantId: z.string(), quantity: z.number().int().min(1).max(999) })).min(1, "Ajoutez au moins un produit."),
  email: z.string().trim().toLowerCase().email("Indiquez l'e-mail du client."),
  name: z.string().trim().min(1, "Indiquez le nom du client.").max(80),
  line1: z.string().trim().max(140),
  zip: z.string().trim().max(12),
  city: z.string().trim().max(60),
  country: z.string().trim().max(60),
  shipping: z.string(),
  note: z.string().max(500),
  paid: z.boolean(),
});
export type ManualOrderInput = z.infer<typeof schema>;

export async function createManualOrder(input: ManualOrderInput): Promise<{ error?: string }> {
  const { user, store } = await requireStore();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const shippingCents = parseMoney(d.shipping || "0");
  if (shippingCents === null) return { error: "Frais de livraison invalides." };

  const variants = await db.variant.findMany({ where: { id: { in: d.lines.map((l) => l.variantId) }, product: { storeId: store.id } }, include: { product: true } });
  const lines: PricedCart["lines"] = [];
  for (const l of d.lines) {
    const v = variants.find((x) => x.id === l.variantId);
    if (!v) return { error: "Un produit de la commande n'existe plus." };
    if (d.paid && l.quantity > v.stock) return { error: `Stock insuffisant pour ${v.product.title}${v.title !== "Par défaut" ? ` (${v.title})` : ""} : ${v.stock} disponible${v.stock > 1 ? "s" : ""}.` };
    lines.push({
      variantId: v.id, productId: v.productId, productTitle: v.product.title, productHandle: v.product.handle, variantTitle: v.title,
      priceCents: v.priceCents, compareAtCents: v.compareAtCents, quantity: l.quantity, available: v.stock,
      image: parseJson<string[]>(v.product.images, [])[0] ?? null, hue: v.product.hue,
    });
  }
  const subtotalCents = lines.reduce((s, l) => s + l.priceCents * l.quantity, 0);
  const cart: PricedCart = {
    lines, subtotalCents, discountCents: 0, discountCode: null, discountError: null, shippingCents,
    totalCents: subtotalCents + shippingCents, freeShippingFromCents: store.freeShippingFromCents, notices: [],
    countries: null, shippingOptions: [], shippingRateId: null, shippingMethod: shippingCents ? "Livraison" : "", shippingError: null,
    giftCardCode: null, giftCardCents: 0, giftCardBalanceCents: 0, giftCardError: null,
    taxRateBps: store.taxRateBps, taxCents: 0,
  };
  const order = await createOrder(store, cart, { email: d.email, name: d.name, address: { line1: d.line1, zip: d.zip, city: d.city, country: d.country }, note: d.note }, "manual");
  await db.orderEvent.create({ data: { orderId: order.id, type: "created_manual", author: user.name, createdAt: order.createdAt } });
  if (d.paid) {
    await markOrderPaid(order.id);
    await db.orderEvent.create({ data: { orderId: order.id, type: "paid_manual", author: user.name } });
  }
  redirect(`/admin/orders/${order.id}`);
}
