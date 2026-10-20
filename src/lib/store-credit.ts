import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";

/**
 * Crédit en magasin (comme sur Shopify) : un solde par client, crédité par le marchand (geste commercial,
 * remboursement en crédit) et dépensé au paiement. Chaque mouvement est tracé (StoreCreditEntry).
 */
type Tx = Prisma.TransactionClient;

/** Ajoute (ou retire, delta négatif) du crédit ; le solde ne descend jamais sous zéro. */
export async function adjustStoreCredit(storeId: string, customerId: string, deltaCents: number, reason: string, author = "", orderId?: string, client: Tx | typeof db = db) {
  const delta = Math.trunc(deltaCents);
  if (!delta) return null;
  if (delta < 0) {
    const r = await client.customer.updateMany({ where: { id: customerId, storeId, storeCreditCents: { gte: -delta } }, data: { storeCreditCents: { decrement: -delta } } });
    if (!r.count) return null;
  } else {
    const r = await client.customer.updateMany({ where: { id: customerId, storeId }, data: { storeCreditCents: { increment: delta } } });
    if (!r.count) return null;
  }
  return client.storeCreditEntry.create({ data: { storeId, customerId, deltaCents: delta, reason, author, orderId } });
}

/** Réserve le crédit utilisé par une commande (atomique : deux commandes simultanées ne dépensent pas deux fois le même solde). */
export async function reserveStoreCredit(storeId: string, customerId: string, cents: number, orderId: string) {
  if (cents <= 0) return true;
  return Boolean(await adjustStoreCredit(storeId, customerId, -cents, `Utilisé sur une commande`, "", orderId));
}

/** Rend le crédit d'une commande annulée avant paiement. */
export async function releaseStoreCredit(storeId: string, customerId: string, cents: number, orderId: string) {
  if (cents <= 0) return;
  await adjustStoreCredit(storeId, customerId, cents, "Commande annulée : crédit rendu", "", orderId);
}

export async function storeCreditHistory(customerId: string, take = 20) {
  return db.storeCreditEntry.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take });
}
