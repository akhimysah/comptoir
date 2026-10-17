import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";

/**
 * Stock par emplacement. Le stock total de chaque variante (Variant.stock) reste la référence pour la vente en ligne ;
 * chaque emplacement supplémentaire a sa quantité (InventoryLevel) et l'emplacement principal détient le reste.
 * Une vente en ligne retire donc du principal ; une expédition ou une vente en caisse depuis un autre
 * emplacement y déplace le retrait.
 */
export const PRIMARY = "primary";

type Tx = Prisma.TransactionClient;
export type StoreLocation = { id: string; name: string; address: string };

/** Emplacements de la boutique, le principal en premier. */
export async function storeLocations(store: { id: string; primaryLocationName: string }): Promise<StoreLocation[]> {
  const others = await db.location.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, address: true } });
  return [{ id: PRIMARY, name: store.primaryLocationName, address: "" }, ...others];
}

/** Quantités par variante et par emplacement (principal compris). */
export async function stockByLocation(storeId: string, variants: { id: string; stock: number }[]) {
  const levels = await db.inventoryLevel.findMany({ where: { variantId: { in: variants.map((v) => v.id) }, location: { storeId } } });
  const out = new Map<string, Map<string, number>>();
  for (const v of variants) {
    const mine = levels.filter((l) => l.variantId === v.id);
    const m = new Map(mine.map((l) => [l.locationId, l.quantity]));
    m.set(PRIMARY, v.stock - mine.reduce((s, l) => s + l.quantity, 0));
    out.set(v.id, m);
  }
  return out;
}

async function levelOf(tx: Tx, locationId: string, variantId: string) {
  return (await tx.inventoryLevel.findUnique({ where: { locationId_variantId: { locationId, variantId } } }))?.quantity ?? 0;
}
async function othersSum(tx: Tx, variantId: string) {
  return (await tx.inventoryLevel.aggregate({ where: { variantId }, _sum: { quantity: true } }))._sum.quantity ?? 0;
}
const addLevel = (tx: Tx, locationId: string, variantId: string, delta: number) =>
  tx.inventoryLevel.upsert({ where: { locationId_variantId: { locationId, variantId } }, update: { quantity: { increment: delta } }, create: { locationId, variantId, quantity: delta } });

/** Vérifie que l'emplacement appartient à la boutique (le principal toujours). */
export async function ownLocation(storeId: string, locationId: string | null | undefined) {
  if (!locationId || locationId === PRIMARY) return PRIMARY;
  return (await db.location.findFirst({ where: { id: locationId, storeId }, select: { id: true } }))?.id ?? null;
}

/** Saisie de la quantité d'un emplacement (inventaire) : le stock total suit. Renvoie le nouveau total. */
export async function setLocationStock(storeId: string, variantId: string, locationId: string, qty: number) {
  return db.$transaction(async (tx) => {
    const v = await tx.variant.findFirst({ where: { id: variantId, product: { storeId } } });
    if (!v) throw new Error("Variante introuvable.");
    if (locationId === PRIMARY) {
      const total = qty + (await othersSum(tx, variantId));
      await tx.variant.update({ where: { id: variantId }, data: { stock: total } });
      return total;
    }
    const delta = qty - (await levelOf(tx, locationId, variantId));
    await addLevel(tx, locationId, variantId, delta);
    return (await tx.variant.update({ where: { id: variantId }, data: { stock: { increment: delta } } })).stock;
  });
}

/** Transfert entre deux emplacements : le stock total ne change pas. */
export async function transferStock(storeId: string, variantId: string, from: string, to: string, qty: number): Promise<{ error?: string }> {
  if (from === to || qty <= 0) return { error: "Choisissez deux emplacements différents et une quantité." };
  return db.$transaction(async (tx) => {
    const v = await tx.variant.findFirst({ where: { id: variantId, product: { storeId } } });
    if (!v) return { error: "Variante introuvable." };
    const available = from === PRIMARY ? v.stock - (await othersSum(tx, variantId)) : await levelOf(tx, from, variantId);
    if (available < qty) return { error: `Seulement ${Math.max(0, available)} disponible(s) à l'emplacement de départ.` };
    if (from !== PRIMARY) await addLevel(tx, from, variantId, -qty);
    if (to !== PRIMARY) await addLevel(tx, to, variantId, qty);
    return {};
  });
}

/**
 * Commande expédiée ou vendue en caisse depuis un emplacement : le retrait (fait sur le stock total au paiement)
 * est déplacé du principal vers cet emplacement. Refusé si l'emplacement n'a pas assez de stock.
 */
export async function shipFromLocation(tx: Tx, orderId: string, locationId: string, moves: { variantId: string; quantity: number }[]) {
  if (locationId === PRIMARY) return null;
  const need = new Map<string, number>();
  for (const m of moves) need.set(m.variantId, (need.get(m.variantId) ?? 0) + m.quantity);
  for (const [variantId, q] of need) {
    const have = await levelOf(tx, locationId, variantId);
    if (have < q) {
      const v = await tx.variant.findUnique({ where: { id: variantId }, include: { product: { select: { title: true } } } });
      return `Stock insuffisant à cet emplacement : ${v?.product.title ?? "article"}${v && v.title !== "Par défaut" ? ` (${v.title})` : ""}, ${have} disponible(s).`;
    }
  }
  for (const [variantId, q] of need) await addLevel(tx, locationId, variantId, -q);
  await tx.order.update({ where: { id: orderId }, data: { fulfillmentLocationId: locationId } });
  return null;
}

/** Expédition annulée : les articles reviennent à l'emplacement d'où ils étaient partis. */
export async function returnToLocation(tx: Tx, orderId: string, locationId: string, moves: { variantId: string; quantity: number }[]) {
  for (const m of moves) await addLevel(tx, locationId, m.variantId, m.quantity);
  await tx.order.update({ where: { id: orderId }, data: { fulfillmentLocationId: null } });
}
