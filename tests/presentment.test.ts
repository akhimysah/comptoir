import { describe, expect, it } from "vitest";
import { orderCurrency, presentmentRefund, presentmentTotal } from "@/lib/presentment";

/** Paiement dans la devise du client : montants prélevés et remboursés. */
describe("devise du client", () => {
  const cart = { lines: [{ priceCents: 1999, quantity: 3 }], shippingCents: 490, discountCents: 500, giftCardCents: 0 };

  it("prélève la somme des lignes converties, comme la page de paiement Stripe", () => {
    // 1 EUR = 1,0837 USD : 19,99 € → 21,66 $ ; 3 × 21,66 + 5,31 − 5,42
    expect(presentmentTotal(cart, 1.0837)).toBe(2166 * 3 + 531 - 542);
  });

  it("rembourse au plus ce qui a été payé, et le reste exact au dernier remboursement", () => {
    const order = { presentmentCurrency: "USD", presentmentRate: 1.0837, presentmentTotalCents: 6487, totalCents: 5987, refundedCents: 0 };
    const a = presentmentRefund(order, 1000);
    const b = presentmentRefund({ ...order, refundedCents: 1000 }, 2000);
    const c = presentmentRefund({ ...order, refundedCents: 3000 }, 2987);
    expect(a + b + c).toBe(6487);
    expect(presentmentRefund({ ...order, presentmentCurrency: null }, 1000)).toBe(1000);
  });

  it("affiche la commande dans la devise payée", () => {
    const cur = orderCurrency({ presentmentCurrency: "USD", presentmentRate: 1.1, presentmentTotalCents: 1100, totalCents: 1000 }, "EUR");
    expect(cur.currency).toBe("USD");
    expect(cur.convert(500)).toBe(550);
    expect(orderCurrency({ presentmentCurrency: null, presentmentRate: 1, presentmentTotalCents: null, totalCents: 1000 }, "EUR").total).toBe(1000);
  });
});
