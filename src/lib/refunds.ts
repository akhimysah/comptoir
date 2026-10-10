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

  // Une ligne par article (deux entrées pour le même article sont additionnées avant contrôle).
  const merged = new Map<string, number>();
  for (const l of args.lines) merged.set(l.orderItemId, (merged.get(l.orderItemId) ?? 0) + Math.floor(l.quantity));
  for (const [id, q] of merged) {
    const item = order.items.find((i) => i.id === id);
    if (!item || q < 0 || q > item.quantity - item.refundedQuantity) return { error: "Quantité à rembourser invalide." };
  }
  const lines: RefundLine[] = [...merged].filter(([, q]) => q > 0).map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
  const max = refundableCents(order);
  const amount = Math.round(args.amountCents);
  if (amount < 0 || amount > max) return { error: `Le montant doit être compris entre 0 et ${formatMoney(max, order.store.currency)}.` };
  if (amount === 0 && !lines.length && !args.cancel) return { error: "Choisissez des articles ou un montant à rembourser." };

  // Cartes cadeaux achetées dans cette commande : on ne rembourse que des cartes jamais utilisées, et on les désactive.
  const giftCardsToDisable: string[] = [];
  for (const l of lines) {
    const item = order.items.find((i) => i.id === l.orderItemId)!;
    if (!item.isGiftCard) continue;
    const cards = await db.giftCard.findMany({ where: { orderId: order.id, initialCents: item.priceCents, disabled: false, id: { notIn: giftCardsToDisable } }, take: l.quantity });
    if (cards.length < l.quantity || cards.some((c) => c.balanceCents < c.initialCents)) return { error: "Une carte cadeau de cette commande a déjà été utilisée : elle ne peut plus être remboursée." };
    giftCardsToDisable.push(...cards.map((c) => c.id));
  }

  // On réserve le montant d'abord (mise à jour conditionnelle) : deux remboursements simultanés ne peuvent pas dépasser le total.
  const claim = await db.order.updateMany({ where: { id: order.id, refundedCents: order.refundedCents }, data: { refundedCents: { increment: amount } } });
  if (!claim.count) return { error: "La commande vient d'être modifiée. Rechargez la page et réessayez." };

  let stripeRefundId: string | null = null;
  if (amount > 0 && order.paymentMethod === "stripe") {
    const stripe = getStripe();
    const undo = () => db.order.update({ where: { id: order.id }, data: { refundedCents: { decrement: amount } } });
    if (!stripe) { await undo(); return { error: "Stripe n'est pas configuré : impossible de rembourser la carte du client." }; }
    try {
      const pi = await paymentIntentOf(order);
      if (!pi) { await undo(); return { error: "Paiement Stripe introuvable pour cette commande : remboursez le client depuis votre tableau de bord Stripe." }; }
      const r = await stripe.refunds.create({ payment_intent: pi, amount, reverse_transfer: true, refund_application_fee: true });
      stripeRefundId = r.id;
    } catch (e) {
      await undo();
      return { error: `Stripe a refusé le remboursement : ${(e as Error).message}` };
    }
  }

  const refunded = order.refundedCents + amount;
  const fully = refunded >= order.totalCents;
  const status = fully || (args.cancel && amount === max) ? "refunded" : refunded > 0 ? "partially_refunded" : order.paymentStatus;

  await db.$transaction([
    db.refund.create({ data: { orderId: order.id, amountCents: amount, shippingCents: args.shippingCents, items: JSON.stringify(lines), restock: args.restock, reason: args.reason, stripeRefundId, author: args.author } }),
    db.order.update({ where: { id: order.id }, data: { paymentStatus: status, ...(args.cancel ? { cancelledAt: new Date() } : {}) } }),
    ...lines.map((l) => db.orderItem.update({ where: { id: l.orderItemId }, data: { refundedQuantity: { increment: l.quantity } } })),
    ...(args.restock ? await restockMoves(order.items, lines) : []),
    ...(giftCardsToDisable.length ? [db.giftCard.updateMany({ where: { id: { in: giftCardsToDisable } }, data: { disabled: true, balanceCents: 0 } })] : []),
    // À l'annulation, la part payée par carte cadeau retourne sur la carte du client.
    ...(args.cancel && order.giftCardCode && order.giftCardCents > 0 ? [db.giftCard.updateMany({ where: { storeId: order.storeId, code: order.giftCardCode }, data: { balanceCents: { increment: order.giftCardCents } } })] : []),
    db.orderEvent.create({
      data: {
        orderId: order.id,
        type: args.cancel ? "cancelled_refund" : "refund",
        author: args.author,
        message: `${formatMoney(amount, order.store.currency)}${lines.length ? ` · ${lines.reduce((s, l) => s + l.quantity, 0)} article(s)${args.restock ? " remis en stock" : ""}` : ""}${args.cancel && order.giftCardCents ? ` · ${formatMoney(order.giftCardCents, order.store.currency)} recrédités sur la carte cadeau` : ""}${args.reason ? ` · ${args.reason}` : ""}`,
      },
    }),
  ]);

  if (amount > 0) await revokePoints(order.id, amount);
  if (args.cancel) await (await import("./webhooks")).emitOrder(order.id, "orders/cancelled");
  if (args.restock && lines.length) {
    const { notifyBackInStock } = await import("./stock-alerts");
    await notifyBackInStock({ storeId: order.storeId });
  }
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

/** Paiement Stripe d'une commande : enregistré à la commande, sinon retrouvé via la session ou la facture (abonnements). */
async function paymentIntentOf(order: { id: string; stripePaymentIntentId: string | null; stripeSessionId: string | null }) {
  if (order.stripePaymentIntentId) return order.stripePaymentIntentId;
  const stripe = getStripe();
  if (!stripe || !order.stripeSessionId) return null;
  const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
  let pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  if (!pi && session.invoice) {
    const invoice = await stripe.invoices.retrieve(typeof session.invoice === "string" ? session.invoice : session.invoice.id);
    pi = typeof invoice.payment_intent === "string" ? invoice.payment_intent : invoice.payment_intent?.id ?? null;
  }
  if (pi) await db.order.update({ where: { id: order.id }, data: { stripePaymentIntentId: pi } });
  return pi;
}
