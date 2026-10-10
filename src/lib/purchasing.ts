import "server-only";
import { db } from "./db";

export const PO_STATUS = {
  draft: { label: "Brouillon", tone: "neutral" },
  ordered: { label: "Commandé", tone: "info" },
  partial: { label: "Reçu en partie", tone: "attention" },
  received: { label: "Reçu", tone: "ok" },
  cancelled: { label: "Annulé", tone: "neutral" },
} as const;

export type PoLine = { variantId: string; quantity: number; costCents: number };

/** Total d'un bon : articles au coût + frais de port du fournisseur. */
export const poTotal = (po: { shippingCents: number; items: { quantity: number; costCents: number }[] }) =>
  po.items.reduce((s, i) => s + i.quantity * i.costCents, 0) + po.shippingCents;

/** Quantités commandées et pas encore reçues, par variante (bons commandés ou reçus en partie). */
export async function incomingByVariant(storeId: string) {
  const items = await db.purchaseOrderItem.findMany({ where: { purchaseOrder: { storeId, status: { in: ["ordered", "partial"] } } }, select: { variantId: true, quantity: true, received: true } });
  const map = new Map<string, number>();
  for (const i of items) if (i.variantId) map.set(i.variantId, (map.get(i.variantId) ?? 0) + Math.max(0, i.quantity - i.received));
  return map;
}

/** Remplace les lignes d'un brouillon (variantes de la boutique uniquement, titres figés au moment de l'ajout). */
export async function setDraftLines(storeId: string, poId: string, lines: PoLine[]) {
  const variants = await db.variant.findMany({ where: { id: { in: lines.map((l) => l.variantId) }, product: { storeId } }, include: { product: { select: { title: true } } } });
  const rows = lines.flatMap((l) => {
    const v = variants.find((x) => x.id === l.variantId);
    return v ? [{ purchaseOrderId: poId, variantId: v.id, productTitle: v.product.title, variantTitle: v.title, sku: v.sku, quantity: l.quantity, costCents: l.costCents }] : [];
  });
  await db.$transaction([db.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: poId } }), db.purchaseOrderItem.createMany({ data: rows })]);
  return rows.length;
}

/**
 * Réception de marchandise : ajoute au stock ce qui est arrivé, met à jour le statut du bon
 * et, si demandé, le coût par article des produits. Les quantités ne dépassent jamais ce qui reste à recevoir.
 */
export async function receiveItems(storeId: string, poId: string, received: { itemId: string; quantity: number }[], updateCosts: boolean): Promise<{ error?: string; count?: number }> {
  const po = await db.purchaseOrder.findFirst({ where: { id: poId, storeId }, include: { items: true } });
  if (!po) return { error: "Bon de commande introuvable." };
  if (!["ordered", "partial"].includes(po.status)) return { error: "Ce bon n'est pas en attente de réception." };
  const moves = received.flatMap((r) => {
    const item = po.items.find((i) => i.id === r.itemId);
    const qty = Math.min(Math.max(0, Math.floor(r.quantity)), item ? item.quantity - item.received : 0);
    return item && qty > 0 ? [{ item, qty }] : [];
  });
  if (!moves.length) return { error: "Indiquez les quantités reçues." };
  const variantIds = moves.map((m) => m.item.variantId).filter((v): v is string => !!v);
  const existing = new Set((await db.variant.findMany({ where: { id: { in: variantIds }, product: { storeId } }, select: { id: true } })).map((v) => v.id));
  try {
    await db.$transaction(async (tx) => {
      for (const m of moves) {
        // Mise à jour conditionnelle sur la quantité déjà reçue : deux réceptions simultanées ne s'additionnent pas.
        const r = await tx.purchaseOrderItem.updateMany({ where: { id: m.item.id, received: m.item.received }, data: { received: { increment: m.qty } } });
        if (!r.count) throw new Error("conflict");
        if (m.item.variantId && existing.has(m.item.variantId)) {
          await tx.variant.update({ where: { id: m.item.variantId }, data: { stock: { increment: m.qty }, ...(updateCosts && m.item.costCents > 0 ? { costCents: m.item.costCents } : {}) } });
        }
      }
    });
  } catch {
    return { error: "Ce bon vient d'être modifié. Rechargez la page et réessayez." };
  }
  const items = await db.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
  const done = items.every((i) => i.received >= i.quantity);
  await db.purchaseOrder.update({ where: { id: po.id }, data: { status: done ? "received" : "partial", receivedAt: done ? new Date() : null } });
  return { count: moves.reduce((s, m) => s + m.qty, 0) };
}
