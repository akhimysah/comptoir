import "server-only";
import { db } from "./db";

/** Délais de paiement proposés aux clients professionnels (0 = paiement à la commande). */
export const PAYMENT_TERMS = [0, 15, 30, 45, 60] as const;
export const termsLabel = (days: number) => (days ? `Paiement à ${days} jours` : "Paiement à la commande");

export type ProPricing = { name: string; percentOff: number; fixed: Map<string, number> };

/** Prix professionnel : prix fixe de la liste s'il existe, sinon le prix public moins la réduction générale. */
export function proPrice(baseCents: number, variantId: string, list: ProPricing | null) {
  if (!list) return baseCents;
  const fixed = list.fixed.get(variantId);
  if (fixed !== undefined) return Math.min(baseCents, fixed);
  return Math.round((baseCents * (100 - Math.min(90, Math.max(0, list.percentOff)))) / 100);
}

/** Liste de prix d'un client pour ces variantes (null si le client n'en a pas). */
export async function loadProPricing(storeId: string, priceListId: string | null | undefined, variantIds: string[]): Promise<ProPricing | null> {
  if (!priceListId) return null;
  const list = await db.priceList.findFirst({ where: { id: priceListId, storeId }, include: { prices: { where: { variantId: { in: variantIds } } } } });
  if (!list) return null;
  return { name: list.name, percentOff: list.percentOff, fixed: new Map(list.prices.map((p) => [p.variantId, p.priceCents])) };
}

/** Une commande à échéance est en retard quand la date limite est passée sans paiement. */
export const isOverdue = (o: { dueAt: Date | null; paymentStatus: string; cancelledAt: Date | null }, now = new Date()) =>
  Boolean(o.dueAt && o.paymentStatus === "pending" && !o.cancelledAt && o.dueAt < now);
