"use server";

import { logActivity } from "@/lib/activity";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { canFulfill, cancelUnpaidOrder, markOrderPaid, notifyOrderShipped } from "@/lib/orders";
import { PAID_STATUSES, refundableCents, refundOrder } from "@/lib/refunds";
import { decideReturn } from "@/lib/returns";
import { carrierLabel } from "@/lib/tracking";
import { sendInvoice } from "@/lib/invoices";
import { pickupReadyEmail } from "@/lib/emails";
import { sendMail } from "@/lib/mail";

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

/** Suivi saisi dans le formulaire : transporteur connu ou libre, numéro, lien personnalisé (https uniquement). */
function readTracking(form: FormData) {
  const carrier = String(form.get("carrier") ?? "").trim().slice(0, 40);
  const number = String(form.get("trackingNumber") ?? "").replace(/\s+/g, "").slice(0, 60);
  const url = String(form.get("trackingUrl") ?? "").trim().slice(0, 500);
  return { trackingCarrier: number ? carrier : "", trackingNumber: number, trackingUrl: number && carrier === "other" && /^https:\/\/[^\s]+$/i.test(url) ? url : "" };
}
const trackingText = (t: { trackingCarrier: string; trackingNumber: string }) => (t.trackingNumber ? `${carrierLabel(t.trackingCarrier)} · ${t.trackingNumber}` : "");

export async function setFulfilled(form: FormData) {
  const { user, order } = await ownOrder(form);
  const fulfilled = form.get("value") === "fulfilled";
  const notify = form.get("hasNotify") ? form.get("notify") === "on" : true;
  const tracking = fulfilled ? readTracking(form) : { trackingCarrier: "", trackingNumber: "", trackingUrl: "" };
  // Mise à jour conditionnelle : un double clic n'expédie (et n'envoie l'e-mail) qu'une fois.
  const done = await db.order.updateMany({ where: { id: order.id, fulfillmentStatus: fulfilled ? "unfulfilled" : "fulfilled" }, data: { fulfillmentStatus: fulfilled ? "fulfilled" : "unfulfilled", fulfilledAt: fulfilled ? new Date() : null, ...tracking } });
  if (!done.count) return revalidatePath(`/admin/orders/${order.id}`);
  await db.orderEvent.create({ data: { orderId: order.id, type: fulfilled ? "fulfilled" : "unfulfilled", author: user.name, message: trackingText(tracking) } });
  if (fulfilled && notify && order.deliveryMethod !== "pickup") await notifyOrderShipped(order.id);
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
    if (!canFulfill(o) || o.fulfillmentStatus === target) continue;
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

export async function updateTracking(form: FormData) {
  const { user, order } = await ownOrder(form);
  if (order.fulfillmentStatus !== "fulfilled") return;
  const tracking = readTracking(form);
  await db.order.update({ where: { id: order.id }, data: tracking });
  await db.orderEvent.create({ data: { orderId: order.id, type: "tracking_updated", author: user.name, message: trackingText(tracking) || "suivi retiré" } });
  if (form.get("notify") === "on" && tracking.trackingNumber) await notifyOrderShipped(order.id, true);
  revalidatePath(`/admin/orders/${order.id}`);
}

export async function sendInvoiceAction(form: FormData) {
  const { user, store, order } = await ownOrder(form);
  const res = await sendInvoice(store.id, order.id, user.name, String(form.get("message") ?? ""));
  if (res.error) redirect(`/admin/orders/${order.id}?err=${encodeURIComponent(res.error)}`);
  await logActivity(`Facture de la commande #${order.number} envoyée`, `/admin/orders/${order.id}`);
  revalidatePath(`/admin/orders/${order.id}`);
}

export async function markPickupReady(form: FormData) {
  const { user, order } = await ownOrder(form);
  if (order.deliveryMethod !== "pickup" || order.fulfillmentStatus === "fulfilled" || order.cancelledAt) return;
  const r = await db.order.updateMany({ where: { id: order.id, pickupReadyAt: null }, data: { pickupReadyAt: new Date() } });
  if (!r.count) return revalidatePath(`/admin/orders/${order.id}`);
  await db.orderEvent.create({ data: { orderId: order.id, type: "pickup_ready", author: user.name } });
  if (form.get("notify") === "on") {
    const full = await db.order.findUnique({ where: { id: order.id }, include: { items: true, store: true } });
    if (full) await sendMail({ to: full.email, storeId: full.storeId, ...pickupReadyEmail(full.store, full) });
  }
  await logActivity(`Commande #${order.number} prête pour le retrait`, `/admin/orders/${order.id}`);
  revalidatePath(`/admin/orders/${order.id}`);
}
