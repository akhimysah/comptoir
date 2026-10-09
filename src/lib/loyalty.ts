import "server-only";
import { randomInt } from "crypto";
import type { Store } from "@prisma/client";
import { db } from "./db";

export const pointsFor = (store: Store, cents: number) => (store.loyaltyEnabled ? Math.floor((Math.max(0, cents) / 100) * store.loyaltyPointsPerUnit) : 0);

/** Points gagnés par une commande payée (hors cartes cadeaux achetées). */
export async function earnPoints(orderId: string) {
  const o = await db.order.findUnique({ where: { id: orderId }, include: { store: true, items: true } });
  if (!o?.customerId || !o.store.loyaltyEnabled) return;
  const giftItems = o.items.filter((i) => i.isGiftCard).reduce((s, i) => s + i.priceCents * i.quantity, 0);
  const pts = pointsFor(o.store, o.totalCents + o.giftCardCents - giftItems - o.shippingCents);
  if (pts <= 0) return;
  await db.$transaction([
    db.customer.update({ where: { id: o.customerId }, data: { points: { increment: pts } } }),
    db.loyaltyEntry.create({ data: { storeId: o.storeId, customerId: o.customerId, points: pts, reason: `Commande #${o.number}`, orderId: o.id } }),
  ]);
}

/** Retire les points correspondant à un remboursement (sans descendre sous zéro). */
export async function revokePoints(orderId: string, refundedCents: number) {
  const o = await db.order.findUnique({ where: { id: orderId }, include: { store: true, customer: true } });
  if (!o?.customer || !o.store.loyaltyEnabled) return;
  const earned = await db.loyaltyEntry.findFirst({ where: { orderId: o.id, points: { gt: 0 } } });
  if (!earned) return;
  // Le solde peut devenir négatif : sinon on pourrait gagner des points, les échanger, puis se faire rembourser.
  const pts = pointsFor(o.store, refundedCents);
  if (pts <= 0) return;
  await db.$transaction([
    db.customer.update({ where: { id: o.customer.id }, data: { points: { decrement: pts } } }),
    db.loyaltyEntry.create({ data: { storeId: o.storeId, customerId: o.customer.id, points: -pts, reason: `Remboursement commande #${o.number}`, orderId: o.id } }),
  ]);
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Échange des points contre un bon à usage unique, réservé à ce client. */
export async function redeemReward(store: Store, customerId: string): Promise<{ error?: string; code?: string }> {
  if (!store.loyaltyEnabled) return { error: "Le programme de fidélité n'est pas actif." };
  const c = await db.customer.findUnique({ where: { id: customerId } });
  if (!c || c.storeId !== store.id) return { error: "Compte introuvable." };
  // Décrément conditionnel : deux clics simultanés ne peuvent pas dépenser deux fois les mêmes points.
  const res = await db.customer.updateMany({ where: { id: c.id, points: { gte: store.loyaltyRewardPoints } }, data: { points: { decrement: store.loyaltyRewardPoints } } });
  if (!res.count) return { error: `Il vous faut ${store.loyaltyRewardPoints} points.` };
  const code = `FIDELITE-${Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;
  await db.$transaction([
    db.discount.create({ data: { storeId: store.id, code, type: "fixed", value: store.loyaltyRewardCents, usageLimit: 1, customerEmail: c.email, title: "Bon fidélité" } }),
    db.loyaltyEntry.create({ data: { storeId: store.id, customerId: c.id, points: -store.loyaltyRewardPoints, reason: `Bon ${code}` } }),
  ]);
  return { code };
}
