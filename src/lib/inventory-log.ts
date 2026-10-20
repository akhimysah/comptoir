import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";

/**
 * Historique des ajustements de stock (comme « Afficher l'historique des ajustements » dans Shopify).
 * Chaque changement de quantité d'une variante laisse une ligne : variation (+/−), stock après, motif, auteur, emplacement.
 * Une variation nulle n'est pas enregistrée.
 */
type Db = Prisma.TransactionClient | typeof db;

export type Adjustment = { storeId: string; variantId: string; delta: number; after: number; reason: string; author?: string; locationId?: string | null };

export async function logAdjustment(tx: Db, a: Adjustment) {
  if (!a.delta) return;
  await tx.inventoryAdjustment.create({ data: { storeId: a.storeId, variantId: a.variantId, delta: a.delta, after: a.after, reason: a.reason.slice(0, 200), author: (a.author ?? "").slice(0, 120), locationId: a.locationId ?? null } });
}

/** Mise à jour du stock d'une variante avec trace : renvoie la variante après coup (null si elle n'existe plus). */
export async function adjustStock(tx: Db, storeId: string, variantId: string, delta: number, reason: string, author = "", locationId: string | null = null) {
  if (!delta) return null;
  const owned = await tx.variant.findFirst({ where: { id: variantId, product: { storeId } }, select: { id: true } });
  if (!owned) return null;
  const v = await tx.variant.update({ where: { id: variantId }, data: { stock: { increment: delta } }, select: { stock: true } });
  await logAdjustment(tx, { storeId, variantId, delta, after: v.stock, reason, author, locationId });
  return v;
}
