import "server-only";
import { db } from "./db";
import { createOrder, markOrderPaid, type Address } from "./orders";
import type { PricedCart } from "./pricing";
import { nextDate } from "./subscriptions";
import { includedTax } from "./tax";
import { parseJson } from "./utils";

/**
 * Crée la commande d'une échéance d'abonnement.
 * Sans Stripe (démonstration, paiement hors ligne), la commande est marquée payée comme les commandes de démonstration ;
 * avec Stripe, c'est le webhook « invoice.paid » qui appelle cette fonction après le prélèvement.
 */
export async function renewSubscription(subscriptionId: string, opts: { paidByStripe?: boolean } = {}) {
  const sub = await db.subscription.findUnique({ where: { id: subscriptionId }, include: { store: true } });
  if (!sub || sub.status !== "active") return null;
  const store = sub.store;
  const v = await db.variant.findUnique({ where: { id: sub.variantId }, include: { product: true } });
  const subtotal = sub.priceCents * sub.quantity;
  const shipping = store.freeShippingFromCents === 0 || subtotal >= store.freeShippingFromCents ? 0 : store.shippingCents;
  const cart: PricedCart = {
    lines: [{
      variantId: sub.variantId, baseVariantId: sub.variantId, subscription: null, productId: v?.productId ?? "", productTitle: sub.productTitle, productHandle: v?.product.handle ?? "",
      variantTitle: sub.variantTitle, priceCents: sub.priceCents, compareAtCents: null, quantity: sub.quantity, available: 999,
      image: v ? parseJson<string[]>(v.product.images, [])[0] ?? null : null, hue: v?.product.hue ?? 200, isGiftCard: false,
    }],
    subtotalCents: subtotal, discountCents: 0, discountCode: null, discountError: null, shippingCents: shipping, totalCents: subtotal + shipping,
    freeShippingFromCents: store.freeShippingFromCents, notices: [], countries: null, shippingOptions: [], shippingRateId: null,
    shippingMethod: "Livraison abonnement", shippingError: null, giftCardCode: null, giftCardCents: 0, giftCardBalanceCents: 0, giftCardError: null,
    taxRateBps: store.taxRateBps, taxCents: includedTax(subtotal + shipping, store.taxRateBps),
  };
  const order = await createOrder(store, cart, { email: sub.email, name: sub.name, address: parseJson<Address>(sub.address, { line1: "", zip: "", city: "", country: "" }), note: `Renouvellement d'abonnement (${sub.productTitle})` }, opts.paidByStripe ? "stripe" : "demo");
  await db.order.update({ where: { id: order.id }, data: { subscriptionId: sub.id } });
  await markOrderPaid(order.id);
  await db.subscription.update({ where: { id: sub.id }, data: { nextBillingAt: nextDate(sub.nextBillingAt > new Date() ? sub.nextBillingAt : new Date(), sub.interval), ordersCount: { increment: 1 } } });
  return order;
}

/** Échéances arrivées à terme, hors abonnements gérés par Stripe. */
export async function renewDueSubscriptions() {
  const due = await db.subscription.findMany({ where: { status: "active", stripeSubscriptionId: null, nextBillingAt: { lte: new Date() } } });
  let n = 0;
  for (const s of due) if (await renewSubscription(s.id)) n++;
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
