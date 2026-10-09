import "server-only";
import { db } from "./db";
import { createOrder, markOrderPaid, type Address } from "./orders";
import type { PricedCart } from "./pricing";
import { nextDate } from "./subscriptions";
import { includedTax } from "./tax";
import { parseJson } from "./utils";

type StripeRenewal = { invoiceId: string; amountPaidCents: number; paymentIntentId: string | null };

/**
 * Crée la commande d'une échéance d'abonnement, toujours dans la boutique de l'abonnement.
 * - Sans Stripe (démonstration, paiement hors ligne) : l'échéance est d'abord « réservée » en avançant sa date
 *   par une mise à jour conditionnelle, pour qu'un double déclenchement ne crée pas deux commandes.
 * - Avec Stripe : appelée par le webhook « invoice.paid » ; la facture Stripe (unique par commande) empêche les doublons
 *   et le montant de la commande est celui réellement prélevé.
 */
export async function renewSubscription(storeId: string, subscriptionId: string, stripe?: StripeRenewal) {
  const sub = await db.subscription.findFirst({ where: { id: subscriptionId, storeId }, include: { store: true } });
  if (!sub || sub.status !== "active") return null;
  if (stripe) {
    if (await db.order.findUnique({ where: { stripeInvoiceId: stripe.invoiceId } })) return null; // déjà traitée
  } else {
    if (sub.stripeSubscriptionId) return null; // prélevé par Stripe : jamais de commande « gratuite » ici
    const claimed = await db.subscription.updateMany({
      where: { id: sub.id, status: "active", nextBillingAt: sub.nextBillingAt },
      data: { nextBillingAt: nextDate(sub.nextBillingAt > new Date() ? sub.nextBillingAt : new Date(), sub.interval) },
    });
    if (!claimed.count) return null;
  }
  const store = sub.store;
  const v = await db.variant.findUnique({ where: { id: sub.variantId }, include: { product: true } });
  const subtotal = sub.priceCents * sub.quantity;
  // Stripe ne prélève que le prix récurrent : la livraison n'est ajoutée qu'aux renouvellements hors Stripe.
  const shipping = stripe || store.freeShippingFromCents === 0 || subtotal >= store.freeShippingFromCents ? 0 : store.shippingCents;
  const total = stripe ? stripe.amountPaidCents : subtotal + shipping;
  const cart: PricedCart = {
    lines: [{
      variantId: sub.variantId, baseVariantId: sub.variantId, subscription: null, productId: v?.productId ?? "", productTitle: sub.productTitle, productHandle: v?.product.handle ?? "",
      variantTitle: sub.variantTitle, priceCents: sub.priceCents, compareAtCents: null, quantity: sub.quantity, available: 999,
      image: v ? parseJson<string[]>(v.product.images, [])[0] ?? null : null, hue: v?.product.hue ?? 200, isGiftCard: false,
    }],
    subtotalCents: subtotal, discountCents: Math.max(0, subtotal + shipping - total), discountCode: null, discountError: null, discountId: null, shippingCents: shipping, totalCents: total,
    freeShippingFromCents: store.freeShippingFromCents, notices: [], countries: null, shippingOptions: [], shippingRateId: null,
    shippingMethod: "Livraison abonnement", shippingError: null, giftCardCode: null, giftCardCents: 0, giftCardBalanceCents: 0, giftCardError: null,
    taxRateBps: store.taxRateBps, taxCents: includedTax(total, store.taxRateBps),
  };
  const order = await createOrder(store, cart, { email: sub.email, name: sub.name, address: parseJson<Address>(sub.address, { line1: "", zip: "", city: "", country: "" }), note: `Renouvellement d'abonnement (${sub.productTitle})` }, stripe ? "stripe" : "demo");
  try {
    await db.order.update({ where: { id: order.id }, data: { subscriptionId: sub.id, ...(stripe ? { stripeInvoiceId: stripe.invoiceId, stripePaymentIntentId: stripe.paymentIntentId } : {}) } });
  } catch {
    await db.order.delete({ where: { id: order.id } }); // facture déjà enregistrée par un appel simultané
    return null;
  }
  await markOrderPaid(order.id);
  await db.subscription.update({ where: { id: sub.id }, data: { ordersCount: { increment: 1 }, ...(stripe ? { nextBillingAt: nextDate(new Date(), sub.interval) } : {}) } });
  return order;
}

/** Échéances arrivées à terme, hors abonnements gérés par Stripe. */
export async function renewDueSubscriptions() {
  const due = await db.subscription.findMany({ where: { status: "active", stripeSubscriptionId: null, nextBillingAt: { lte: new Date() } } });
  let n = 0;
  for (const s of due) if (await renewSubscription(s.storeId, s.id)) n++;
  return n;
}

/** Pause, reprise ou résiliation, répercutée sur Stripe quand l'abonnement y est prélevé. */
export async function setSubscriptionStatus(storeId: string, id: string, status: "active" | "paused" | "cancelled", customerId?: string) {
  const sub = await db.subscription.findFirst({ where: { id, storeId, ...(customerId ? { customerId } : {}) } });
  if (!sub || sub.status === "cancelled") return { error: "Abonnement introuvable ou déjà résilié." };
  if (sub.stripeSubscriptionId) {
    const { getStripe } = await import("./stripe");
    const stripe = getStripe();
    if (!stripe) return { error: "Stripe n'est pas configuré." };
    if (status === "cancelled") await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
    else await stripe.subscriptions.update(sub.stripeSubscriptionId, { pause_collection: status === "paused" ? { behavior: "void" } : null });
  }
  // À la reprise, la prochaine échéance repart d'aujourd'hui si elle était dépassée.
  const next = status === "active" && sub.nextBillingAt < new Date() ? nextDate(new Date(), sub.interval) : sub.nextBillingAt;
  await db.subscription.update({ where: { id: sub.id }, data: { status, nextBillingAt: next } });
  return {};
}
