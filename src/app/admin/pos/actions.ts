"use server";

import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { createOrder, markOrderPaid } from "@/lib/orders";
import type { PricedCart } from "@/lib/pricing";
import { includedTax } from "@/lib/tax";
import { parseJson } from "@/lib/utils";
import { bundleComponents, bundleStock } from "@/lib/bundles";

const schema = z.object({
  lines: z.array(z.object({ variantId: z.string(), quantity: z.number().int().min(1).max(999) })).min(1, "Le ticket est vide."),
  discountCents: z.number().int().min(0),
  method: z.enum(["cash", "card"]),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
  name: z.string().trim().max(80).optional().default(""),
});

/** Vente au point de vente : commande payée et remise au client sur place (traitée). */
export async function posCheckout(input: z.infer<typeof schema>): Promise<{ error?: string; orderId?: string; number?: number }> {
  const { user, store } = await requirePerm("orders");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const variants = await db.variant.findMany({ where: { id: { in: d.lines.map((l) => l.variantId) }, product: { storeId: store.id } }, include: { product: true } });
  const bundles = await bundleComponents([...new Set(variants.map((v) => v.productId))]);
  const lines: PricedCart["lines"] = [];
  for (const l of d.lines) {
    const v = variants.find((x) => x.id === l.variantId);
    if (!v) return { error: "Un article du ticket n'existe plus." };
    const stock = bundles.has(v.productId) ? bundleStock(bundles.get(v.productId)!) : v.stock;
    if (!v.product.isGiftCard && !v.product.continueSelling && l.quantity > stock) return { error: `Stock insuffisant : ${v.product.title}${v.title !== "Par défaut" ? ` (${v.title})` : ""}, ${stock} disponible${stock > 1 ? "s" : ""}.` };
    lines.push({
      variantId: v.id, baseVariantId: v.id, subscription: null, productId: v.productId, productTitle: v.product.title, productHandle: v.product.handle, variantTitle: v.title,
      priceCents: v.priceCents, compareAtCents: v.compareAtCents, quantity: l.quantity, available: stock,
      image: (v.image ?? parseJson<string[]>(v.product.images, [])[0]) ?? null, hue: v.product.hue, isGiftCard: v.product.isGiftCard,
    });
  }
  const subtotal = lines.reduce((s, l) => s + l.priceCents * l.quantity, 0);
  const discount = Math.min(d.discountCents, subtotal);
  const total = subtotal - discount;
  const giftItems = lines.filter((l) => l.isGiftCard).reduce((s, l) => s + l.priceCents * l.quantity, 0);
  const cart: PricedCart = {
    lines, subtotalCents: subtotal, discountCents: discount, discountCode: discount ? "Remise en caisse" : null, discountError: null, discountId: null,
    shippingCents: 0, totalCents: total, freeShippingFromCents: 0, notices: [], countries: null, shippingOptions: [], shippingRateId: null,
    shippingMethod: "Retrait en boutique", shippingError: null, giftCardCode: null, giftCardCents: 0, giftCardBalanceCents: 0, giftCardError: null,
    taxRateBps: store.taxRateBps, taxCents: includedTax(total - giftItems, store.taxRateBps),
  };
  const email = d.email || `caisse+${Date.now()}@${store.slug}.local`;
  const order = await createOrder(store, cart, { email, name: d.name || "Client en boutique", address: { line1: "Vente en boutique", zip: "", city: "", country: "" }, note: "" }, d.method === "cash" ? "pos_cash" : "pos_card");
  // Vente anonyme : pas de fiche client fictive.
  if (!d.email && order.customerId) {
    await db.order.update({ where: { id: order.id }, data: { customerId: null } });
    await db.customer.deleteMany({ where: { id: order.customerId, orders: { none: {} } } });
  }
  await markOrderPaid(order.id);
  await db.$transaction([
    db.order.update({ where: { id: order.id }, data: { fulfillmentStatus: "fulfilled", fulfilledAt: new Date(), reviewRequestedAt: new Date() } }),
    db.orderEvent.create({ data: { orderId: order.id, type: "pos_sale", author: user.name, message: d.method === "cash" ? "espèces" : "carte" } }),
  ]);
  await logActivity(`Vente en caisse #${order.number}`, `/admin/orders/${order.id}`);
  return { orderId: order.id, number: order.number };
}
