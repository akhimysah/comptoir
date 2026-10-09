import "server-only";
import { Prisma, type Store } from "@prisma/client";
import { db } from "./db";
import { randomInt } from "crypto";
import { giftCardEmail, lowStockEmail, newOrderAlertEmail, orderConfirmationEmail, shippingEmail } from "./emails";
import { sendMail } from "./mail";
import { earnPoints } from "./loyalty";
import type { PricedCart } from "./pricing";

export type Address = { line1: string; zip: string; city: string; country: string };

export async function createOrder(
  store: Store,
  cart: PricedCart,
  buyer: { email: string; name: string; address: Address; note: string },
  paymentMethod: "demo" | "stripe" | "manual" | "pos_cash" | "pos_card",
) {
  const email = buyer.email.trim().toLowerCase();
  const customer = await db.customer.upsert({
    where: { storeId_email: { storeId: store.id, email } },
    update: { name: buyer.name },
    create: { storeId: store.id, email, name: buyer.name },
  });

  // Le numéro de commande suit le précédent ; on réessaie si deux commandes arrivent en même temps.
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await db.order.findFirst({ where: { storeId: store.id }, orderBy: { number: "desc" }, select: { number: true } });
    try {
      const order = await db.order.create({
        data: {
          storeId: store.id,
          number: (last?.number ?? 1000) + 1,
          customerId: customer.id,
          email,
          name: buyer.name,
          address: JSON.stringify(buyer.address),
          note: buyer.note,
          subtotalCents: cart.subtotalCents,
          discountCents: cart.discountCents,
          discountCode: cart.discountCode,
          giftCardCode: cart.giftCardCode,
          giftCardCents: cart.giftCardCents,
          taxRateBps: store.taxRateBps,
          taxCents: cart.taxCents,
          shippingCents: cart.shippingCents,
          shippingMethod: cart.shippingMethod,
          totalCents: cart.totalCents,
          paymentMethod,
          items: {
            create: cart.lines.map((l) => ({
              variantId: l.variantId,
              productTitle: l.productTitle,
              variantTitle: l.variantTitle,
              priceCents: l.priceCents,
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

/** Passe la commande en « payée », décrémente le stock et compte l'usage du code promo. Sans effet si déjà payée. */
export async function markOrderPaid(orderId: string) {
  const lowStock: { title: string; stock: number }[] = [];
  const paid = await db.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: "pending", cancelledAt: null },
      data: { paymentStatus: "paid", paidAt: new Date() },
    });
    if (updated.count === 0) return false;
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    // Un lot vendu retire du stock chacun de ses composants.
    const moves: { variantId: string; quantity: number }[] = [];
    for (const item of order.items) {
      if (!item.variantId || item.isGiftCard) continue;
      const owner = await tx.variant.findUnique({ where: { id: item.variantId }, select: { productId: true } });
      const parts = owner ? await tx.bundleItem.findMany({ where: { bundleId: owner.productId } }) : [];
      if (parts.length) for (const p of parts) moves.push({ variantId: p.variantId, quantity: p.quantity * item.quantity });
      else moves.push({ variantId: item.variantId, quantity: item.quantity });
    }
    for (const item of moves) {
      const v = await tx.variant.findUnique({ where: { id: item.variantId }, include: { product: { include: { store: true } } } });
      if (!v) continue;
      // En précommande, le stock peut devenir négatif : il indique ce qui reste à réapprovisionner.
      const after = v.product.continueSelling ? v.stock - item.quantity : Math.max(0, v.stock - item.quantity);
      await tx.variant.update({ where: { id: v.id }, data: { stock: after } });
      const threshold = v.product.store.lowStockThreshold;
      if (threshold > 0 && v.stock > threshold && after <= threshold) lowStock.push({ title: v.title === "Par défaut" ? v.product.title : `${v.product.title} (${v.title})`, stock: after });
    }
    if (order.giftCardCode && order.giftCardCents > 0) {
      const card = await tx.giftCard.findUnique({ where: { storeId_code: { storeId: order.storeId, code: order.giftCardCode } } });
      if (card) await tx.giftCard.update({ where: { id: card.id }, data: { balanceCents: Math.max(0, card.balanceCents - order.giftCardCents) } });
    }
    if (order.discountCode) {
      await tx.discount.updateMany({
        where: { storeId: order.storeId, code: order.discountCode },
        data: { usageCount: { increment: 1 } },
      });
    }
    return true;
  });
  if (paid) {
    await earnPoints(orderId);
    await issuePurchasedGiftCards(orderId);
    await notifyOrderPaid(orderId);
    if (lowStock.length) {
      const o = await db.order.findUnique({ where: { id: orderId }, include: { store: { include: { owner: true } } } });
      if (o) await sendMail({ to: o.store.owner.email, storeId: o.storeId, ...lowStockEmail(o.store, lowStock) });
    }
  }
  return paid;
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
  const confirm = orderConfirmationEmail(order.store, order);
  const alert = newOrderAlertEmail(order.store, order);
  await Promise.all([
    anonymous ? Promise.resolve() : sendMail({ to: order.email, storeId: order.storeId, ...confirm }),
    order.paymentMethod.startsWith("pos") ? Promise.resolve() : sendMail({ to: order.store.owner.email, storeId: order.storeId, ...alert }),
  ]);
}

/** E-mail d'expédition au client. */
export async function notifyOrderShipped(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, store: true } });
  if (order) await sendMail({ to: order.email, storeId: order.storeId, ...shippingEmail(order.store, order) });
}

type Tone = "warn" | "ok" | "neutral" | "bad" | "attention";
export const PAYMENT_LABELS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Paiement en attente", tone: "warn" },
  paid: { label: "Payée", tone: "neutral" },
  refunded: { label: "Remboursée", tone: "neutral" },
  partially_refunded: { label: "Partiellement remboursée", tone: "warn" },
};
export const FULFILLMENT_LABELS: Record<string, { label: string; tone: Tone }> = {
  unfulfilled: { label: "Non traitée", tone: "attention" },
  fulfilled: { label: "Traitée", tone: "neutral" },
};
