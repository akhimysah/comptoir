"use server";

import { logActivity } from "@/lib/activity";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { cancelUnpaidOrder, markOrderPaid, notifyOrderShipped } from "@/lib/orders";
import { PAID_STATUSES, refundableCents, refundOrder } from "@/lib/refunds";
import { decideReturn } from "@/lib/returns";

async function ownOrder(form: FormData) {
  const { user, store } = await requirePerm("orders");
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
    db.order.update({ where: { id: order.id }, data: { fulfillmentStatus: fulfilled ? "fulfilled" : "unfulfilled", fulfilledAt: fulfilled ? new Date() : null } }),
    db.orderEvent.create({ data: { orderId: order.id, type: fulfilled ? "fulfilled" : "unfulfilled", author: user.name } }),
  ]);
  if (fulfilled) await notifyOrderShipped(order.id);
  await logActivity(`Commande #${order.number} marquée comme ${fulfilled ? "traitée" : "non traitée"}`, `/admin/orders/${order.id}`);
  revalidatePath(`/admin/orders/${order.id}`);
  revalidatePath("/admin", "layout");
}

/** Annule la commande : rembourse ce qui reste à rembourser et remet en stock les articles non encore retournés. */
export async function cancelOrder(form: FormData): Promise<void> {
  const { user, store, order } = await ownOrder(form);
  if (order.cancelledAt) return;
  if (!PAID_STATUSES.includes(order.paymentStatus)) {
    await cancelUnpaidOrder(order.id, user.name);
  } else {
    const items = await db.orderItem.findMany({ where: { orderId: order.id } });
    const res = await refundOrder({
      orderId: order.id, storeId: store.id, author: user.name, cancel: true, restock: true, reason: "Commande annulée",
      lines: items.map((i) => ({ orderItemId: i.id, quantity: i.quantity - i.refundedQuantity })),
      shippingCents: 0, amountCents: refundableCents(order),
    });
    if (res.error) throw new Error(res.error);
  }
  await logActivity(`Commande #${order.number} annulée`, `/admin/orders/${order.id}`);
  revalidatePath(`/admin/orders/${order.id}`);
  revalidatePath("/admin", "layout");
}

/** Actions groupées depuis la liste des commandes. Renvoie le nombre de commandes modifiées. */
export async function bulkOrders(ids: string[], action: "fulfill" | "unfulfill" | "markPaid"): Promise<{ count: number }> {
  const { user, store } = await requirePerm("orders");
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
      db.order.update({ where: { id: o.id }, data: { fulfillmentStatus: target, fulfilledAt: target === "fulfilled" ? new Date() : null } }),
      db.orderEvent.create({ data: { orderId: o.id, type: target, author: user.name } }),
    ]);
    if (target === "fulfilled") await notifyOrderShipped(o.id);
    count++;
  }
  if (count) await logActivity(`${count} commande(s) : ${action === "fulfill" ? "marquées traitées" : action === "unfulfill" ? "marquées non traitées" : "marquées payées"}`);
  revalidatePath("/admin", "layout");
  return { count };
}

export async function markPaid(form: FormData) {
  const id = String(form.get("id"));
  await bulkOrders([id], "markPaid");
  revalidatePath(`/admin/orders/${id}`);
}

export async function returnDecision(form: FormData) {
  const { user, store } = await requirePerm("orders");
  const id = String(form.get("returnId") ?? "");
  const action = String(form.get("action") ?? "");
  const r = await db.returnRequest.findFirst({ where: { id, storeId: store.id }, select: { orderId: true, order: { select: { number: true } } } });
  if (!r) throw new Error("Retour introuvable.");
  const decision =
    action === "decline" ? { action: "decline" as const, reason: String(form.get("reason") ?? "").trim() }
    : action === "approve" || action === "receive" || action === "reopen" ? { action: action as "approve" | "receive" | "reopen" }
    : null;
  if (!decision) throw new Error("Action inconnue.");
  const res = await decideReturn(store.id, id, user.name, decision);
  if (res.error) redirect(`/admin/orders/${r.orderId}?err=${encodeURIComponent(res.error)}`);
  const verb = { approve: "accepté", decline: "refusé", receive: "marqué comme reçu", reopen: "rouvert" }[decision.action];
  await logActivity(`Retour ${verb} sur la commande #${r.order.number}`, `/admin/orders/${r.orderId}`);
  revalidatePath(`/admin/orders/${r.orderId}`);
  revalidatePath("/admin/orders/returns");
}
