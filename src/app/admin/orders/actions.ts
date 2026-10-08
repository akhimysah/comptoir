"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";
import { markOrderPaid, notifyOrderShipped } from "@/lib/orders";
import { PAID_STATUSES, refundableCents, refundOrder } from "@/lib/refunds";

async function ownOrder(form: FormData) {
  const { user, store } = await requireStore();
  const order = await db.order.findFirst({ where: { id: String(form.get("id")), storeId: store.id } });
  if (!order) throw new Error("Commande introuvable.");
  return { user, store, order };
}

export async function addOrderComment(form: FormData) {
  const { user, order } = await ownOrder(form);
  const message = String(form.get("message") ?? "").trim().slice(0, 2000);
  if (!message) return;
  await db.orderEvent.create({ data: { orderId: order.id, type: "comment", message, author: user.name } });
  revalidatePath(`/admin/orders/${order.id}`);
}

export async function setFulfilled(form: FormData) {
  const { user, order } = await ownOrder(form);
  const fulfilled = form.get("value") === "fulfilled";
  await db.$transaction([
    db.order.update({ where: { id: order.id }, data: { fulfillmentStatus: fulfilled ? "fulfilled" : "unfulfilled" } }),
    db.orderEvent.create({ data: { orderId: order.id, type: fulfilled ? "fulfilled" : "unfulfilled", author: user.name } }),
  ]);
  if (fulfilled) await notifyOrderShipped(order.id);
  revalidatePath(`/admin/orders/${order.id}`);
  revalidatePath("/admin", "layout");
}

/** Annule la commande : rembourse ce qui reste à rembourser et remet en stock les articles non encore retournés. */
export async function cancelOrder(form: FormData): Promise<void> {
  const { user, store, order } = await ownOrder(form);
  if (order.cancelledAt) return;
  if (!PAID_STATUSES.includes(order.paymentStatus)) {
    await db.$transaction([
      db.order.update({ where: { id: order.id }, data: { cancelledAt: new Date() } }),
      db.orderEvent.create({ data: { orderId: order.id, type: "cancelled", author: user.name } }),
    ]);
  } else {
    const items = await db.orderItem.findMany({ where: { orderId: order.id } });
    const res = await refundOrder({
      orderId: order.id, storeId: store.id, author: user.name, cancel: true, restock: true, reason: "Commande annulée",
      lines: items.map((i) => ({ orderItemId: i.id, quantity: i.quantity - i.refundedQuantity })),
      shippingCents: 0, amountCents: refundableCents(order),
    });
    if (res.error) throw new Error(res.error);
  }
  revalidatePath(`/admin/orders/${order.id}`);
  revalidatePath("/admin", "layout");
}

/** Actions groupées depuis la liste des commandes. Renvoie le nombre de commandes modifiées. */
export async function bulkOrders(ids: string[], action: "fulfill" | "unfulfill" | "markPaid"): Promise<{ count: number }> {
  const { user, store } = await requireStore();
  const own = await db.order.findMany({ where: { id: { in: ids.slice(0, 500) }, storeId: store.id, cancelledAt: null } });
  let count = 0;
  for (const o of own) {
    if (action === "markPaid") {
      // Paiements hors ligne uniquement : un paiement Stripe se confirme par Stripe.
      if (o.paymentStatus !== "pending" || o.paymentMethod === "stripe") continue;
      if (await markOrderPaid(o.id)) {
        await db.orderEvent.create({ data: { orderId: o.id, type: "paid_manual", author: user.name } });
        count++;
      }
      continue;
    }
    const target = action === "fulfill" ? "fulfilled" : "unfulfilled";
    if (!PAID_STATUSES.includes(o.paymentStatus) || o.fulfillmentStatus === target) continue;
    await db.$transaction([
      db.order.update({ where: { id: o.id }, data: { fulfillmentStatus: target } }),
      db.orderEvent.create({ data: { orderId: o.id, type: target, author: user.name } }),
    ]);
    if (target === "fulfilled") await notifyOrderShipped(o.id);
    count++;
  }
  revalidatePath("/admin", "layout");
  return { count };
}

export async function markPaid(form: FormData) {
  const id = String(form.get("id"));
  await bulkOrders([id], "markPaid");
  revalidatePath(`/admin/orders/${id}`);
}
