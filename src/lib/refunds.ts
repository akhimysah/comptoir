import "server-only";
import { db } from "./db";
import { formatMoney } from "./money";
import { sendMail } from "./mail";
import { getStripe } from "./stripe";
import { refundEmail } from "./emails";
import { revokePoints } from "./loyalty";

export const PAID_STATUSES = ["paid", "partially_refunded"];

export type RefundLine = { orderItemId: string; quantity: number };

/** Montant encore remboursable : ce que le client a payé (hors carte cadeau) moins ce qui a déjà été rendu. */
export const refundableCents = (o: { totalCents: number; refundedCents: number }) => Math.max(0, o.totalCents - o.refundedCents);

/** Valeur suggérée d'un article remboursé : son prix, moins sa part de la remise de la commande. */
export function suggestedItemRefund(o: { subtotalCents: number; discountCents: number }, priceCents: number, quantity: number) {
  const ratio = o.subtotalCents ? 1 - o.discountCents / o.subtotalCents : 1;
  return Math.round(priceCents * quantity * ratio);
}

/**
 * Rembourse une commande (en totalité ou en partie) : Stripe si besoin, retour en stock,
 * quantités remboursées, statut, chronologie et e-mail au client.
 */
export async function refundOrder(args: {
  orderId: string; storeId: string; lines: RefundLine[]; shippingCents: number; amountCents: number;
  restock: boolean; reason: string; author: string; cancel?: boolean; notify?: boolean;
}): Promise<{ error?: string }> {
  const order = await db.order.findFirst({ where: { id: args.orderId, storeId: args.storeId }, include: { items: true, store: true } });
  if (!order) return { error: "Commande introuvable." };
  if (!PAID_STATUSES.includes(order.paymentStatus)) return { error: "Cette commande n'a pas été payée : rien à rembourser." };

  for (const l of args.lines) {
    const item = order.items.find((i) => i.id === l.orderItemId);
    if (!item || l.quantity < 0 || l.quantity > item.quantity - item.refundedQuantity) return { error: "Quantité à rembourser invalide." };
  }
  const max = refundableCents(order);
  const amount = Math.round(args.amountCents);
  if (amount < 0 || amount > max) return { error: `Le montant doit être compris entre 0 et ${formatMoney(max, order.store.currency)}.` };
  if (amount === 0 && !args.lines.some((l) => l.quantity > 0) && !args.cancel) return { error: "Choisissez des articles ou un montant à rembourser." };

  let stripeRefundId: string | null = null;
  if (amount > 0 && order.paymentMethod === "stripe" && order.stripeSessionId) {
    const stripe = getStripe();
    if (!stripe) return { error: "Stripe n'est pas configuré : impossible de rembourser la carte du client." };
    try {
      const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
      const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      if (!pi) return { error: "Paiement Stripe introuvable." };
      const r = await stripe.refunds.create({ payment_intent: pi, amount, reverse_transfer: true, refund_application_fee: true });
      stripeRefundId = r.id;
    } catch (e) {
      return { error: `Stripe a refusé le remboursement : ${(e as Error).message}` };
    }
  }

  const refunded = order.refundedCents + amount;
  const fully = refunded >= order.totalCents;
  const status = fully || (args.cancel && amount === max) ? "refunded" : refunded > 0 ? "partially_refunded" : order.paymentStatus;
  const lines = args.lines.filter((l) => l.quantity > 0);

  await db.$transaction([
    db.refund.create({ data: { orderId: order.id, amountCents: amount, shippingCents: args.shippingCents, items: JSON.stringify(lines), restock: args.restock, reason: args.reason, stripeRefundId, author: args.author } }),
    db.order.update({ where: { id: order.id }, data: { refundedCents: refunded, paymentStatus: status, ...(args.cancel ? { cancelledAt: new Date() } : {}) } }),
    ...lines.map((l) => db.orderItem.update({ where: { id: l.orderItemId }, data: { refundedQuantity: { increment: l.quantity } } })),
    ...(args.restock ? await restockMoves(order.items, lines) : []),
    db.orderEvent.create({
      data: {
        orderId: order.id,
        type: args.cancel ? "cancelled_refund" : "refund",
        author: args.author,
        message: `${formatMoney(amount, order.store.currency)}${lines.length ? ` · ${lines.reduce((s, l) => s + l.quantity, 0)} article(s)${args.restock ? " remis en stock" : ""}` : ""}${args.reason ? ` · ${args.reason}` : ""}`,
      },
    }),
  ]);

  if (amount > 0) await revokePoints(order.id, amount);
  if (amount > 0 && args.notify !== false) {
    const items = lines.map((l) => { const i = order.items.find((x) => x.id === l.orderItemId)!; return { title: i.productTitle, quantity: l.quantity }; });
    await sendMail({ to: order.email, storeId: order.storeId, ...refundEmail(order.store, order.number, amount, items, args.reason) });
  }
  return {};
}

/** Remise en stock : un lot rend leurs pièces à ses composants, une carte cadeau ne revient pas en stock. */
async function restockMoves(items: { id: string; variantId: string | null; isGiftCard: boolean }[], lines: RefundLine[]) {
  const ops = [];
  for (const l of lines) {
    const item = items.find((i) => i.id === l.orderItemId);
    if (!item?.variantId || item.isGiftCard) continue;
    const v = await db.variant.findUnique({ where: { id: item.variantId }, select: { productId: true } });
    const parts = v ? await db.bundleItem.findMany({ where: { bundleId: v.productId } }) : [];
    if (parts.length) for (const p of parts) ops.push(db.variant.updateMany({ where: { id: p.variantId }, data: { stock: { increment: p.quantity * l.quantity } } }));
    else ops.push(db.variant.updateMany({ where: { id: item.variantId }, data: { stock: { increment: l.quantity } } }));
  }
  return ops;
}
