import "server-only";
import { Prisma, type Store } from "@prisma/client";
import { db } from "./db";
import type { PricedCart } from "./pricing";

export type Address = { line1: string; zip: string; city: string; country: string };

export async function createOrder(
  store: Store,
  cart: PricedCart,
  buyer: { email: string; name: string; address: Address; note: string },
  paymentMethod: "demo" | "stripe" | "manual",
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
      return await db.order.create({
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
          shippingCents: cart.shippingCents,
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
            })),
          },
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new Error("Impossible d'attribuer un numéro de commande.");
}

/** Passe la commande en « payée », décrémente le stock et compte l'usage du code promo. Sans effet si déjà payée. */
export async function markOrderPaid(orderId: string) {
  return db.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: "pending", cancelledAt: null },
      data: { paymentStatus: "paid", paidAt: new Date() },
    });
    if (updated.count === 0) return false;
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    for (const item of order.items) {
      if (!item.variantId) continue;
      const v = await tx.variant.findUnique({ where: { id: item.variantId } });
      if (v) await tx.variant.update({ where: { id: v.id }, data: { stock: Math.max(0, v.stock - item.quantity) } });
    }
    if (order.discountCode) {
      await tx.discount.updateMany({
        where: { storeId: order.storeId, code: order.discountCode },
        data: { usageCount: { increment: 1 } },
      });
    }
    return true;
  });
}

type Tone = "warn" | "ok" | "neutral" | "bad" | "attention";
export const PAYMENT_LABELS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Paiement en attente", tone: "warn" },
  paid: { label: "Payée", tone: "neutral" },
  refunded: { label: "Remboursée", tone: "neutral" },
};
export const FULFILLMENT_LABELS: Record<string, { label: string; tone: Tone }> = {
  unfulfilled: { label: "Non traitée", tone: "attention" },
  fulfilled: { label: "Traitée", tone: "neutral" },
};
