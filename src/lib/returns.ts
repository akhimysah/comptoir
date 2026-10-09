import "server-only";
import type { Order, OrderItem, ReturnRequest, Store } from "@prisma/client";
import { db } from "./db";
import { returnApprovedEmail, returnDeclinedEmail, returnRequestedAlertEmail, returnRequestedEmail } from "./emails";
import { sendMail } from "./mail";
import { parseJson } from "./utils";

export const RETURN_REASONS = [
  "Taille trop petite",
  "Taille trop grande",
  "Ne correspond pas à la description",
  "Article défectueux ou abîmé",
  "Mauvais article reçu",
  "A changé d'avis",
  "Autre",
] as const;

export const RETURN_STATUS = {
  requested: { label: "Demandé", tone: "attention" },
  approved: { label: "Accepté", tone: "info" },
  received: { label: "Reçu", tone: "info" },
  refunded: { label: "Remboursé", tone: "ok" },
  declined: { label: "Refusé", tone: "neutral" },
} as const;

/** Statuts où les articles sont « engagés » dans un retour et ne peuvent pas être redemandés. */
export const OPEN_RETURN = ["requested", "approved", "received"];

export type ReturnLine = { orderItemId: string; quantity: number; reason: string };
export const returnLines = (r: { items: string }) => parseJson<ReturnLine[]>(r.items, []);

type OrderWithReturns = Order & { items: OrderItem[]; returns: ReturnRequest[] };

/** Date limite de retour : la fenêtre part de l'expédition (ou du paiement si l'expédition n'est pas datée). */
export function returnDeadline(store: Pick<Store, "returnWindowDays">, o: Pick<Order, "fulfilledAt" | "paidAt" | "createdAt">) {
  const from = o.fulfilledAt ?? o.paidAt ?? o.createdAt;
  return new Date(from.getTime() + store.returnWindowDays * 86400_000);
}

/** Quantité encore retournable par article : commandée − remboursée − déjà dans un retour en cours. Les cartes cadeaux ne se retournent pas. */
export function returnableItems(o: OrderWithReturns) {
  const engaged = new Map<string, number>();
  for (const r of o.returns) if (OPEN_RETURN.includes(r.status)) for (const l of returnLines(r)) engaged.set(l.orderItemId, (engaged.get(l.orderItemId) ?? 0) + l.quantity);
  return o.items
    .filter((i) => !i.isGiftCard)
    .map((i) => ({ item: i, available: Math.max(0, i.quantity - i.refundedQuantity - (engaged.get(i.id) ?? 0)) }))
    .filter((x) => x.available > 0);
}

/** Pourquoi une commande ne peut pas (ou plus) être retournée ; null si elle le peut. */
export function returnBlocker(store: Pick<Store, "returnsEnabled" | "returnWindowDays">, o: OrderWithReturns): string | null {
  if (!store.returnsEnabled) return "La boutique ne propose pas de retour en ligne. Contactez-la directement.";
  if (o.cancelledAt || !["paid", "partially_refunded"].includes(o.paymentStatus)) return "Cette commande ne peut pas être retournée.";
  if (o.fulfillmentStatus !== "fulfilled") return "Votre commande n'a pas encore été expédiée : contactez la boutique pour la modifier ou l'annuler.";
  if (returnDeadline(store, o) < new Date()) return `Le délai de retour de ${store.returnWindowDays} jours est dépassé.`;
  if (!returnableItems(o).length) return "Tous les articles de cette commande sont déjà retournés ou remboursés.";
  return null;
}

/** Demande de retour du client : contrôle des quantités, enregistrement, e-mails au client et à la boutique. */
export async function requestReturn(storeId: string, orderId: string, customer: { id: string; email: string }, lines: ReturnLine[], note: string): Promise<{ error?: string; id?: string }> {
  const order = await db.order.findFirst({
    where: { id: orderId, storeId, OR: [{ customerId: customer.id }, { email: customer.email }] },
    include: { items: true, returns: true, store: { include: { owner: true } } },
  });
  if (!order) return { error: "Commande introuvable." };
  const blocker = returnBlocker(order.store, order);
  if (blocker) return { error: blocker };
  const available = new Map(returnableItems(order).map((x) => [x.item.id, x.available]));
  const chosen = lines.filter((l) => l.quantity > 0);
  if (!chosen.length) return { error: "Choisissez au moins un article à retourner." };
  for (const l of chosen) {
    if (!Number.isInteger(l.quantity) || l.quantity > (available.get(l.orderItemId) ?? 0)) return { error: "Quantité à retourner invalide." };
    if (!(RETURN_REASONS as readonly string[]).includes(l.reason)) return { error: "Indiquez le motif du retour pour chaque article." };
  }
  const r = await db.returnRequest.create({ data: { storeId, orderId: order.id, items: JSON.stringify(chosen), note: note.slice(0, 1000) } });
  const count = chosen.reduce((s, l) => s + l.quantity, 0);
  await db.orderEvent.create({ data: { orderId: order.id, type: "return_requested", author: order.name, message: `${count} article(s)` } });
  const items = chosen.map((l) => ({ title: order.items.find((i) => i.id === l.orderItemId)!.productTitle, quantity: l.quantity, reason: l.reason }));
  await Promise.all([
    sendMail({ to: order.email, storeId, ...returnRequestedEmail(order.store, order.number, items) }),
    sendMail({ to: order.store.owner.email, storeId, ...returnRequestedAlertEmail(order.store, order, items, note) }),
  ]);
  return { id: r.id };
}

type Decision = { action: "approve" } | { action: "decline"; reason: string } | { action: "receive" } | { action: "reopen" };

/** Décision de la boutique sur un retour. Le remboursement passe par la page de remboursement (refundOrder). */
export async function decideReturn(storeId: string, id: string, author: string, d: Decision): Promise<{ error?: string }> {
  const r = await db.returnRequest.findFirst({ where: { id, storeId }, include: { order: { include: { items: true } }, store: true } });
  if (!r) return { error: "Retour introuvable." };
  const from: Record<Decision["action"], string[]> = { approve: ["requested"], decline: ["requested", "approved"], receive: ["approved"], reopen: ["declined"] };
  if (!from[d.action].includes(r.status)) return { error: "Ce retour a déjà changé de statut. Rechargez la page." };
  const now = new Date();
  const data =
    d.action === "approve" ? { status: "approved", approvedAt: now }
    : d.action === "decline" ? { status: "declined", declineReason: d.reason.slice(0, 500), closedAt: now }
    : d.action === "receive" ? { status: "received", receivedAt: now }
    : { status: "requested", declineReason: "", closedAt: null };
  // Mise à jour conditionnelle : deux clics simultanés n'appliquent qu'une décision.
  const done = await db.returnRequest.updateMany({ where: { id: r.id, status: r.status }, data });
  if (!done.count) return { error: "Ce retour a déjà changé de statut. Rechargez la page." };
  const type = { approve: "return_approved", decline: "return_declined", receive: "return_received", reopen: "return_reopened" }[d.action];
  await db.orderEvent.create({ data: { orderId: r.orderId, type, author, message: d.action === "decline" && d.reason ? d.reason : "" } });
  const items = returnLines(r).map((l) => ({ title: r.order.items.find((i) => i.id === l.orderItemId)?.productTitle ?? "Article", quantity: l.quantity, reason: l.reason }));
  if (d.action === "approve") await sendMail({ to: r.order.email, storeId, ...returnApprovedEmail(r.store, r.order.number, items) });
  if (d.action === "decline") await sendMail({ to: r.order.email, storeId, ...returnDeclinedEmail(r.store, r.order.number, d.reason) });
  return {};
}
