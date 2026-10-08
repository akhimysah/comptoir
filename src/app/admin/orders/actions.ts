"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

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
  revalidatePath(`/admin/orders/${order.id}`);
  revalidatePath("/admin", "layout");
}

/** Annule la commande, remet le stock si elle était payée, et rembourse le paiement Stripe. */
export async function cancelOrder(form: FormData): Promise<void> {
  const { user, order } = await ownOrder(form);
  if (order.cancelledAt) return;

  let paymentStatus = order.paymentStatus;
  if (order.paymentStatus === "paid" && order.paymentMethod === "stripe" && order.stripeSessionId) {
    const stripe = getStripe();
    if (!stripe) throw new Error("Stripe n'est pas configuré : impossible de rembourser.");
    const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
    const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (pi) await stripe.refunds.create({ payment_intent: pi, reverse_transfer: true, refund_application_fee: true });
    paymentStatus = "refunded";
  } else if (order.paymentStatus === "paid") {
    paymentStatus = "refunded";
  }

  const items = await db.orderItem.findMany({ where: { orderId: order.id } });
  await db.$transaction([
    db.order.update({ where: { id: order.id }, data: { cancelledAt: new Date(), paymentStatus } }),
    db.orderEvent.create({ data: { orderId: order.id, type: paymentStatus === "refunded" ? "refunded" : "cancelled", author: user.name } }),
    ...(order.paymentStatus === "paid"
      ? items.filter((i) => i.variantId).map((i) => db.variant.updateMany({ where: { id: i.variantId! }, data: { stock: { increment: i.quantity } } }))
      : []),
  ]);
  revalidatePath(`/admin/orders/${order.id}`);
  revalidatePath("/admin", "layout");
}
