import "server-only";
import type { Order } from "@prisma/client";
import { db } from "./db";
import { includedTax } from "./tax";
import { formatMoney } from "./money";
import { parseJson } from "./utils";

/**
 * Pourquoi une commande ne peut pas être modifiée ici, ou null.
 * Seules les commandes non payées et non traitées le sont : une commande payée se corrige par
 * un remboursement (articles retirés) ou une commande complémentaire (articles ajoutés).
 */
export function editBlocker(o: Pick<Order, "cancelledAt" | "paymentStatus" | "fulfillmentStatus" | "paymentMethod" | "giftCardCents" | "subscriptionId">) {
  if (o.cancelledAt) return "Cette commande est annulée.";
  if (o.paymentMethod === "terms" && o.paymentStatus === "pending") return "Cette commande à échéance est déjà confirmée au client (stock retiré) : annulez-la et créez-en une nouvelle.";
  if (o.paymentStatus !== "pending") return "paid";
  if (o.fulfillmentStatus === "fulfilled") return "Cette commande est déjà traitée.";
  if (o.paymentMethod === "stripe") return "Le client est en train de payer cette commande en ligne : elle ne peut pas être modifiée.";
  if (o.paymentMethod.startsWith("pos")) return "Les ventes du point de vente ne se modifient pas.";
  if (o.giftCardCents > 0) return "Cette commande utilise une carte cadeau : annulez-la et créez-en une nouvelle.";
  if (o.subscriptionId) return "Les commandes d'abonnement ne se modifient pas.";
  return null;
}

export type EditLine = { itemId?: string; variantId?: string; quantity: number };

/** Applique les modifications : quantités, articles retirés ou ajoutés (au prix actuel), frais de livraison. */
export async function editPendingOrder(storeId: string, orderId: string, lines: EditLine[], shippingCents: number, author: string): Promise<{ error?: string; summary?: string }> {
  const order = await db.order.findFirst({ where: { id: orderId, storeId }, include: { items: true, store: true } });
  if (!order) return { error: "Commande introuvable." };
  const blocker = editBlocker(order);
  if (blocker) return { error: blocker === "paid" ? "Cette commande est payée : utilisez un remboursement ou une commande complémentaire." : blocker };
  if (!Number.isInteger(shippingCents) || shippingCents < 0 || shippingCents > 1_000_000) return { error: "Frais de livraison invalides." };

  const changes: string[] = [];
  const keep = new Map<string, number>();
  for (const l of lines) if (l.itemId) keep.set(l.itemId, Math.max(0, Math.floor(l.quantity)));
  for (const i of order.items) {
    const q = keep.get(i.id) ?? 0;
    if (q !== i.quantity) changes.push(q === 0 ? `retiré : ${i.quantity} × ${i.productTitle}` : `${i.productTitle} : ${i.quantity} → ${q}`);
  }
  const added = lines.filter((l) => !l.itemId && l.variantId && l.quantity > 0);
  const variants = await db.variant.findMany({ where: { id: { in: added.map((l) => l.variantId!) }, product: { storeId } }, include: { product: true } });
  if (variants.length !== new Set(added.map((l) => l.variantId)).size) return { error: "Un article ajouté n'existe plus." };
  const newItems = added.map((l) => {
    const v = variants.find((x) => x.id === l.variantId)!;
    changes.push(`ajouté : ${Math.floor(l.quantity)} × ${v.product.title}${v.title !== "Par défaut" ? ` (${v.title})` : ""}`);
    return {
      orderId: order.id, variantId: v.id, productTitle: v.product.title, variantTitle: v.title, priceCents: v.priceCents, costCents: v.costCents,
      quantity: Math.min(9999, Math.floor(l.quantity)), image: (v.image ?? parseJson<string[]>(v.product.images, [])[0]) ?? null, hue: v.product.hue, isGiftCard: v.product.isGiftCard,
    };
  });
  if (shippingCents !== order.shippingCents) changes.push(`livraison : ${formatMoney(order.shippingCents, order.store.currency)} → ${formatMoney(shippingCents, order.store.currency)}`);
  if (!changes.length) return { error: "Aucune modification." };

  const kept = order.items.filter((i) => (keep.get(i.id) ?? 0) > 0).map((i) => ({ ...i, quantity: keep.get(i.id)! }));
  const subtotal = kept.reduce((s, i) => s + i.priceCents * i.quantity, 0) + newItems.reduce((s, i) => s + i.priceCents * i.quantity, 0);
  if (subtotal <= 0) return { error: "Une commande doit garder au moins un article. Pour tout retirer, annulez-la." };

  // Remise : un pourcentage est recalculé, un montant fixe (code ou remise manuelle) est gardé dans la limite du nouveau sous-total.
  const d = order.discountId ? await db.discount.findUnique({ where: { id: order.discountId } }) : null;
  const giftItems = [...kept, ...newItems].filter((i) => i.isGiftCard).reduce((s, i) => s + i.priceCents * i.quantity, 0);
  const discountable = subtotal - giftItems;
  const discountCents = d?.type === "percent" ? Math.round((discountable * Math.min(d.value, 100)) / 100) : Math.min(order.discountCents, discountable);
  const total = subtotal - discountCents + shippingCents;

  try {
    await db.$transaction(async (tx) => {
      // D'abord la commande, sous condition : si le client vient de payer, rien n'est modifié.
      const r = await tx.order.updateMany({ where: { id: order.id, paymentStatus: "pending", cancelledAt: null }, data: { subtotalCents: subtotal, discountCents, shippingCents, totalCents: total, taxCents: includedTax(total - giftItems, order.taxRateBps) } });
      if (!r.count) throw new Error("changed");
      await tx.orderItem.deleteMany({ where: { orderId: order.id, id: { notIn: kept.map((i) => i.id) } } });
      for (const i of kept) await tx.orderItem.update({ where: { id: i.id }, data: { quantity: i.quantity } });
      if (newItems.length) await tx.orderItem.createMany({ data: newItems });
      await tx.orderEvent.create({ data: { orderId: order.id, type: "edited", author, message: changes.join(" · ") } });
    });
  } catch {
    return { error: "La commande vient d'être payée ou modifiée. Rechargez la page." };
  }
  return { summary: changes.join(" · ") };
}
