import "server-only";
import { Prisma, type Order, type Store } from "@prisma/client";
import { db } from "./db";
import { randomInt } from "crypto";
import { giftCardEmail, lowStockEmail, newOrderAlertEmail, orderConfirmationEmail, shippingEmail } from "./emails";
import { sendMail } from "./mail";
import { earnPoints } from "./loyalty";
import { nextDate } from "./subscriptions";
import type { PricedCart } from "./pricing";
import { payLink } from "./invoices";
import { emitOrder } from "./webhooks";

export type Address = { line1: string; zip: string; city: string; country: string };

export async function createOrder(
  store: Store,
  cart: PricedCart,
  buyer: { email: string; name: string; address: Address; note: string },
  paymentMethod: "demo" | "stripe" | "manual" | "terms" | "pos_cash" | "pos_card",
): Promise<Order> {
  const email = buyer.email.trim().toLowerCase();
  const customer = await db.customer.upsert({
    where: { storeId_email: { storeId: store.id, email } },
    update: { name: buyer.name },
    create: { storeId: store.id, email, name: buyer.name },
  });

  await reserve(store.id, cart);
  try {
    return await insertOrder(store, cart, customer.id, email, buyer, paymentMethod);
  } catch (e) {
    await release(store.id, cart.giftCardCode, cart.giftCardCents, cart.discountId);
    throw e;
  }
}

/** Erreur à montrer telle quelle au client (solde de carte insuffisant, bon déjà utilisé…). */
export class OrderError extends Error {}

/**
 * Réserve dès la création de la commande ce qui ne doit servir qu'une fois : le solde de la carte cadeau
 * et une utilisation du code promo. Les deux sont atomiques : deux commandes simultanées ne peuvent pas
 * dépenser le même solde ni dépasser la limite d'un bon.
 */
async function reserve(storeId: string, cart: PricedCart) {
  if (cart.giftCardCode && cart.giftCardCents > 0) {
    const r = await db.giftCard.updateMany({ where: { storeId, code: cart.giftCardCode, disabled: false, balanceCents: { gte: cart.giftCardCents } }, data: { balanceCents: { decrement: cart.giftCardCents } } });
    if (!r.count) throw new OrderError("Le solde de la carte cadeau ne suffit plus. Rechargez votre panier.");
  }
  if (cart.discountId) {
    const n = await db.$executeRaw`UPDATE "Discount" SET "usageCount" = "usageCount" + 1 WHERE "id" = ${cart.discountId} AND ("usageLimit" IS NULL OR "usageCount" < "usageLimit")`;
    if (!n) {
      await release(storeId, cart.giftCardCode, cart.giftCardCents, null);
      throw new OrderError("Ce code promo a déjà été utilisé le nombre maximum de fois.");
    }
  }
}

/** Rend le solde de carte cadeau et/ou l'utilisation de remise réservés par une commande qui n'aboutit pas. */
export async function release(storeId: string, giftCardCode: string | null, giftCardCents: number, discountId: string | null) {
  if (giftCardCode && giftCardCents > 0) await db.giftCard.updateMany({ where: { storeId, code: giftCardCode }, data: { balanceCents: { increment: giftCardCents } } });
  // Requête portable (SQLite et PostgreSQL) : jamais en dessous de zéro.
  if (discountId) await db.discount.updateMany({ where: { id: discountId, usageCount: { gt: 0 } }, data: { usageCount: { decrement: 1 } } });
}

/** Annule une commande jamais payée (abandon du paiement Stripe, annulation par le marchand) et libère ses réservations. */
export async function cancelUnpaidOrder(orderId: string, author = "") {
  const o = await db.order.findUnique({ where: { id: orderId } });
  if (!o || o.paymentStatus !== "pending" || o.cancelledAt) return false;
  const r = await db.order.updateMany({ where: { id: o.id, paymentStatus: "pending", cancelledAt: null }, data: { cancelledAt: new Date() } });
  if (!r.count) return false;
  await release(o.storeId, o.giftCardCode, o.giftCardCents, o.discountId);
  // Commande à échéance : son stock avait été retiré à la commande, il revient en vente.
  if (o.stockCommittedAt) await db.$transaction(async (tx) => {
    for (const m of await stockMoves(tx, o.id)) await tx.variant.updateMany({ where: { id: m.variantId }, data: { stock: { increment: m.quantity } } });
  });
  await db.orderEvent.create({ data: { orderId: o.id, type: "cancelled", author } });
  await emitOrder(o.id, "orders/cancelled");
  return true;
}

async function insertOrder(
  store: Store,
  cart: PricedCart,
  customerId: string,
  email: string,
  buyer: { email: string; name: string; address: Address; note: string },
  paymentMethod: string,
) {
  // Coût d'achat de chaque article au moment de la commande (pour la marge, même si le coût change ensuite).
  const costs = new Map((await db.variant.findMany({ where: { id: { in: cart.lines.map((l) => l.baseVariantId) } }, select: { id: true, costCents: true } })).map((v) => [v.id, v.costCents]));
  // Le numéro de commande suit le précédent ; on réessaie si deux commandes arrivent en même temps.
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await db.order.findFirst({ where: { storeId: store.id }, orderBy: { number: "desc" }, select: { number: true } });
    try {
      const order = await db.order.create({
        data: {
          storeId: store.id,
          number: (last?.number ?? 1000) + 1,
          customerId,
          email,
          name: buyer.name,
          address: JSON.stringify(buyer.address),
          note: buyer.note,
          subtotalCents: cart.subtotalCents,
          discountCents: cart.discountCents,
          discountCode: cart.discountCode,
          giftCardCode: cart.giftCardCode,
          giftCardCents: cart.giftCardCents,
          discountId: cart.discountId,
          taxRateBps: cart.taxRateBps,
          taxCents: cart.taxCents,
          shippingCents: cart.shippingCents,
          shippingMethod: cart.shippingMethod,
          totalCents: cart.totalCents,
          paymentMethod,
          items: {
            create: cart.lines.map((l) => ({
              variantId: l.baseVariantId,
              subscriptionInterval: l.subscription,
              productTitle: l.productTitle,
              variantTitle: l.variantTitle,
              priceCents: l.priceCents,
              costCents: costs.get(l.baseVariantId) ?? null,
              quantity: l.quantity,
              image: l.image,
              hue: l.hue,
              isGiftCard: l.isGiftCard,
            })),
          },
        },
      });
      // Le panier mémorisé de ce client est marqué comme converti (et « récupéré » s'il avait été relancé).
      const checkout = await db.checkout.findUnique({ where: { storeId_email: { storeId: store.id, email } } });
      if (checkout && !checkout.orderId) {
        await db.checkout.update({ where: { id: checkout.id }, data: { orderId: order.id, ...(checkout.remindedAt ? { recoveredAt: new Date() } : {}) } });
      }
      return order;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new Error("Impossible d'attribuer un numéro de commande.");
}

type Tx = Prisma.TransactionClient;

/** Variantes réellement retirées du stock par une commande : un lot retire chacun de ses composants. */
async function stockMoves(tx: Tx, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  const moves: { variantId: string; quantity: number }[] = [];
  for (const item of items) {
    if (!item.variantId || item.isGiftCard) continue;
    const owner = await tx.variant.findUnique({ where: { id: item.variantId }, select: { productId: true } });
    const parts = owner ? await tx.bundleItem.findMany({ where: { bundleId: owner.productId } }) : [];
    if (parts.length) for (const p of parts) moves.push({ variantId: p.variantId, quantity: p.quantity * item.quantity });
    else moves.push({ variantId: item.variantId, quantity: item.quantity });
  }
  return moves;
}

type StockReport = { lowStock: { title: string; stock: number }[]; oversold: string[] };

/** Retire du stock les articles de la commande, une seule fois (au paiement, ou dès la commande à échéance). */
async function commitStock(tx: Tx, orderId: string, report: StockReport) {
  const first = await tx.order.updateMany({ where: { id: orderId, stockCommittedAt: null }, data: { stockCommittedAt: new Date() } });
  if (!first.count) return;
  for (const item of await stockMoves(tx, orderId)) {
    const v = await tx.variant.findUnique({ where: { id: item.variantId }, include: { product: { include: { store: true } } } });
    if (!v) continue;
    // En précommande, le stock peut devenir négatif : il indique ce qui reste à réapprovisionner.
    const after = v.product.continueSelling ? v.stock - item.quantity : Math.max(0, v.stock - item.quantity);
    // Survente (paiement validé après qu'un autre client a pris le dernier exemplaire) : on la signale au marchand.
    if (!v.product.continueSelling && v.stock < item.quantity) report.oversold.push(`${v.product.title}${v.title !== "Par défaut" ? ` (${v.title})` : ""} : ${item.quantity - Math.max(0, v.stock)} manquant(s)`);
    await tx.variant.update({ where: { id: v.id }, data: { stock: after } });
    const threshold = v.product.store.lowStockThreshold;
    if (threshold > 0 && v.stock > threshold && after <= threshold) report.lowStock.push({ title: v.title === "Par défaut" ? v.product.title : `${v.product.title} (${v.title})`, stock: after });
  }
}

/** Survente signalée dans la chronologie, stock bas signalé par e-mail au propriétaire. */
async function reportStock(orderId: string, { lowStock, oversold }: StockReport) {
  if (oversold.length) await db.orderEvent.create({ data: { orderId, type: "comment", author: "Parnassa Pay", message: `⚠ Stock insuffisant au moment du paiement : ${oversold.join(", ")}. Prévenez le client ou réapprovisionnez.` } });
  if (lowStock.length) {
    const o = await db.order.findUnique({ where: { id: orderId }, include: { store: { include: { owner: true } } } });
    if (o) await sendMail({ to: o.store.owner.email, storeId: o.storeId, ...lowStockEmail(o.store, lowStock) });
  }
}

/** Passe la commande en « payée » et retire le stock (sauf s'il l'a déjà été). Sans effet si déjà payée. */
export async function markOrderPaid(orderId: string) {
  const report: StockReport = { lowStock: [], oversold: [] };
  const paid = await db.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: "pending", cancelledAt: null },
      data: { paymentStatus: "paid", paidAt: new Date() },
    });
    if (updated.count === 0) return false;
    await commitStock(tx, orderId, report);
    // (Le solde de carte cadeau et l'utilisation du code promo ont été réservés à la création de la commande.)
    return true;
  });
  if (paid) {
    await startSubscriptions(orderId);
    await earnPoints(orderId);
    await issuePurchasedGiftCards(orderId);
    // Une commande à échéance a déjà été confirmée au client quand il l'a passée.
    const o = await db.order.findUnique({ where: { id: orderId }, select: { dueAt: true } });
    if (!o?.dueAt) await notifyOrderPaid(orderId);
    await reportStock(orderId, report);
    if (!o?.dueAt) await emitOrder(orderId, "orders/create");
    await emitOrder(orderId, "orders/paid");
  }
  return paid;
}

/**
 * Commande d'un client professionnel à paiement différé : confirmée tout de suite (stock retiré, e-mails),
 * elle reste « en attente de paiement » jusqu'à la date limite et peut être expédiée avant d'être payée.
 */
export async function confirmTermsOrder(orderId: string, days: number) {
  const report: StockReport = { lowStock: [], oversold: [] };
  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { dueAt: new Date(Date.now() + days * 86400_000) } });
    await tx.orderEvent.create({ data: { orderId, type: "comment", author: "Parnassa Pay", message: `Paiement à ${days} jours accordé au client professionnel.` } });
    await commitStock(tx, orderId, report);
  });
  await notifyOrderPaid(orderId);
  await reportStock(orderId, report);
  await emitOrder(orderId, "orders/create");
}

/** Cartes cadeaux achetées dans la boutique : création, envoi du code par e-mail, commande traitée si elle ne contient que des cartes. */
async function issuePurchasedGiftCards(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, store: true } });
  if (!order) return;
  const giftItems = order.items.filter((i) => i.isGiftCard);
  if (!giftItems.length) return;
  for (const item of giftItems) {
    for (let k = 0; k < item.quantity; k++) {
      let code = newGiftCode();
      while (await db.giftCard.findUnique({ where: { storeId_code: { storeId: order.storeId, code } } })) code = newGiftCode();
      await db.giftCard.create({ data: { storeId: order.storeId, code, initialCents: item.priceCents, balanceCents: item.priceCents, email: order.email, orderId: order.id, note: `Achetée avec la commande #${order.number}` } });
      if (!order.email.endsWith(".local")) await sendMail({ to: order.email, storeId: order.storeId, ...giftCardEmail(order.store, code, item.priceCents, "", null) });
    }
  }
  if (giftItems.length === order.items.length) {
    await db.$transaction([
      db.order.update({ where: { id: order.id }, data: { fulfillmentStatus: "fulfilled" } }),
      db.orderEvent.create({ data: { orderId: order.id, type: "giftcards_sent", message: `${giftItems.reduce((s, i) => s + i.quantity, 0)} carte(s) cadeau envoyée(s) par e-mail` } }),
    ]);
  }
}

const GIFT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newGiftCode = () => Array.from({ length: 16 }, () => GIFT_ALPHABET[randomInt(GIFT_ALPHABET.length)]).join("");

/** E-mails après paiement : confirmation au client, alerte au propriétaire. */
async function notifyOrderPaid(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, store: { include: { owner: true } } } });
  if (!order) return;
  const anonymous = order.email.endsWith(".local"); // vente en caisse sans e-mail client
  const pay = order.dueAt && order.paymentStatus === "pending" ? await payLink(order, order.store.slug) : null;
  const confirm = orderConfirmationEmail(order.store, order, pay);
  const alert = newOrderAlertEmail(order.store, order);
  await Promise.all([
    anonymous ? Promise.resolve() : sendMail({ to: order.email, storeId: order.storeId, ...confirm }),
    order.paymentMethod.startsWith("pos") ? Promise.resolve() : sendMail({ to: order.store.owner.email, storeId: order.storeId, ...alert }),
  ]);
}

/**
 * Marque la commande comme traitée (une seule fois, même en cas de double clic), avec le suivi éventuel.
 * Renvoie false si elle l'était déjà.
 */
export async function fulfillOrder(orderId: string, tracking: { trackingCarrier: string; trackingNumber: string; trackingUrl: string }, author: string, message: string, notify: boolean) {
  const done = await db.order.updateMany({ where: { id: orderId, fulfillmentStatus: "unfulfilled", cancelledAt: null }, data: { fulfillmentStatus: "fulfilled", fulfilledAt: new Date(), ...tracking } });
  if (!done.count) return false;
  await db.orderEvent.create({ data: { orderId, type: "fulfilled", author, message } });
  const o = await db.order.findUnique({ where: { id: orderId }, select: { deliveryMethod: true } });
  if (notify && o?.deliveryMethod !== "pickup") await notifyOrderShipped(orderId);
  await emitOrder(orderId, "orders/fulfilled");
  return true;
}

/** E-mail d'expédition au client. */
export async function notifyOrderShipped(orderId: string, update = false) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, store: true } });
  if (order) await sendMail({ to: order.email, storeId: order.storeId, ...shippingEmail(order.store, order, update) });
}

type Tone = "warn" | "ok" | "neutral" | "bad" | "attention";
export const PAYMENT_LABELS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Paiement en attente", tone: "warn" },
  paid: { label: "Payée", tone: "neutral" },
  refunded: { label: "Remboursée", tone: "neutral" },
  partially_refunded: { label: "Partiellement remboursée", tone: "warn" },
};
/** Statut de paiement affiché ; une commande à échéance montre sa date limite, ou son retard. */
export function paymentLabel(o: { paymentStatus: string; dueAt: Date | null }) {
  if (o.paymentStatus === "pending" && o.dueAt) {
    return o.dueAt < new Date()
      ? { label: "Paiement en retard", tone: "bad" as Tone }
      : { label: `À payer avant le ${o.dueAt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`, tone: "warn" as Tone };
  }
  return PAYMENT_LABELS[o.paymentStatus];
}

/** Commande à expédier : payée, ou à échéance (le client professionnel paie après réception). */
export const canFulfill = (o: { paymentStatus: string; dueAt: Date | null; cancelledAt: Date | null }) =>
  !o.cancelledAt && (["paid", "partially_refunded"].includes(o.paymentStatus) || (o.paymentStatus === "pending" && Boolean(o.dueAt)));

export const FULFILLMENT_LABELS: Record<string, { label: string; tone: Tone }> = {
  unfulfilled: { label: "Non traitée", tone: "attention" },
  fulfilled: { label: "Traitée", tone: "neutral" },
};

/** Crée les abonnements d'une première commande payée (pas pour un renouvellement). */
async function startSubscriptions(orderId: string) {
  const o = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!o || o.subscriptionId) return;
  for (const i of o.items.filter((x) => x.subscriptionInterval && x.variantId)) {
    const exists = await db.subscription.findFirst({ where: { firstOrderId: o.id, variantId: i.variantId! } });
    if (exists) continue;
    await db.subscription.create({
      data: {
        storeId: o.storeId, customerId: o.customerId, email: o.email, name: o.name, address: o.address, variantId: i.variantId!,
        productTitle: i.productTitle, variantTitle: i.variantTitle, quantity: i.quantity, priceCents: i.priceCents,
        interval: i.subscriptionInterval!, nextBillingAt: nextDate(o.paidAt ?? new Date(), i.subscriptionInterval!), firstOrderId: o.id,
      },
    });
  }
}
