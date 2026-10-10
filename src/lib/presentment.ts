/**
 * Paiement dans la devise du client (devise de présentation). La commande reste comptée dans la devise
 * de la boutique ; la devise réellement payée et le taux appliqué sont gardés pour le client, Stripe et les remboursements.
 */

/** Devises encaissables : 2 décimales chez Stripe (le yen et le franc CFA n'ont pas de centimes, le dinar tunisien en a 3). */
export const CHARGEABLE_CURRENCIES = new Set(["EUR", "USD", "GBP", "CHF", "CAD", "MAD", "DZD", "AED", "SAR"]);

export const toPresentment = (cents: number, rate: number) => Math.round(cents * rate);

type CartAmounts = { lines: { priceCents: number; quantity: number }[]; shippingCents: number; discountCents: number; giftCardCents: number };

/** Montant prélevé dans la devise du client : chaque ligne convertie comme sur la page de paiement Stripe. */
export function presentmentTotal(cart: CartAmounts, rate: number) {
  const items = cart.lines.reduce((s, l) => s + toPresentment(l.priceCents, rate) * l.quantity, 0);
  return Math.max(0, items + toPresentment(cart.shippingCents, rate) - toPresentment(cart.discountCents + cart.giftCardCents, rate));
}

type OrderPresentment = { presentmentCurrency: string | null; presentmentRate: number; presentmentTotalCents: number | null; totalCents: number };

/** Devise et conversion d'une commande pour ce que voit le client (page de confirmation, e-mails, facture). */
export function orderCurrency(order: OrderPresentment, storeCurrency: string) {
  const foreign = Boolean(order.presentmentCurrency && order.presentmentCurrency !== storeCurrency);
  const rate = foreign ? order.presentmentRate : 1;
  return {
    currency: foreign ? order.presentmentCurrency! : storeCurrency,
    foreign,
    rate,
    /** Montant de la commande (devise de la boutique) → devise payée. */
    convert: (cents: number) => (foreign ? toPresentment(cents, rate) : cents),
    /** Total réellement payé (somme des lignes converties). */
    total: foreign ? order.presentmentTotalCents ?? toPresentment(order.totalCents, rate) : order.totalCents,
  };
}

/**
 * Montant à rembourser dans la devise payée. Calcul cumulé : la somme des remboursements partiels
 * ne dépasse jamais ce qui a été payé, et le dernier remboursement rend exactement le reste.
 */
export function presentmentRefund(order: OrderPresentment & { refundedCents: number }, amountCents: number) {
  if (!order.presentmentCurrency) return amountCents;
  const paid = order.presentmentTotalCents ?? toPresentment(order.totalCents, order.presentmentRate);
  const upTo = (refunded: number) => (refunded >= order.totalCents ? paid : Math.min(paid, toPresentment(refunded, order.presentmentRate)));
  return upTo(order.refundedCents + amountCents) - upTo(order.refundedCents);
}
