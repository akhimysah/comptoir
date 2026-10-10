import type { Discount } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney } from "@/lib/money";
import { discountAmount, discountProblem, eligibleLines } from "@/lib/pricing";
import { refundableCents, suggestedItemRefund } from "@/lib/refunds";
import { includedTax } from "@/lib/tax";

const discount = (d: Partial<Discount>): Discount => ({
  id: "d", storeId: "s", code: "TEST", type: "percent", value: 10, minSubtotalCents: 0, usageLimit: null, usageCount: 0, active: true, automatic: false,
  customerEmail: null, title: "", endsAt: null, startsAt: null, appliesTo: "all", targetIds: "[]", buyQty: 0, getQty: 0, oncePerCustomer: false, createdAt: new Date(), ...d,
});
const line = (productId: string, priceCents: number, quantity = 1, isGiftCard = false) => ({ productId, priceCents, quantity, isGiftCard });

describe("montants", () => {
  it("lit les montants saisis à la française ou à l'anglaise", () => {
    expect(parseMoney("12,50")).toBe(1250);
    expect(parseMoney("12.5")).toBe(1250);
    expect(parseMoney("abc")).toBeNull();
  });
  it("formate en euros", () => {
    expect(formatMoney(123456).replace(/\s/g, " ")).toBe("1 234,56 €");
  });
  it("calcule la TVA incluse", () => {
    expect(includedTax(12000, 2000)).toBe(2000); // 120 € TTC à 20 % → 20 € de TVA
    expect(includedTax(5000, 0)).toBe(0); // franchise en base
  });
});

describe("remises", () => {
  const cart = [line("bol", 2800, 2), line("assiette", 3200, 1)];
  it("pourcentage sur tout le panier, cartes cadeaux exclues", () => {
    const d = discount({ type: "percent", value: 10 });
    const eligible = eligibleLines(d, [...cart, line("carte", 5000, 1, true)], new Map());
    expect(discountAmount(d, eligible)).toBe(880); // 10 % de 88 €
  });
  it("limitée à une collection", () => {
    const d = discount({ type: "percent", value: 20, appliesTo: "collections", targetIds: JSON.stringify(["bols"]) });
    const eligible = eligibleLines(d, cart, new Map([["bol", new Set(["bols"])]]));
    expect(discountAmount(d, eligible)).toBe(1120); // 20 % de 2 × 28 €, l'assiette n'en profite pas
  });
  it("montant fixe plafonné au panier", () => {
    const d = discount({ type: "fixed", value: 50000 });
    expect(discountAmount(d, eligibleLines(d, cart, new Map()))).toBe(8800);
  });
  it("Achetez 2, le 3e offert : le moins cher de chaque lot", () => {
    const d = discount({ type: "bxgy", value: 100, buyQty: 2, getQty: 1 });
    expect(discountAmount(d, eligibleLines(d, cart, new Map()))).toBe(2800);
    // 6 articles = 2 lots : les 2 moins chers sont offerts
    const six = [line("a", 1000, 3), line("b", 500, 3)];
    expect(discountAmount(d, eligibleLines(d, six, new Map()))).toBe(1000);
  });
  it("le 2e à −50 %", () => {
    const d = discount({ type: "bxgy", value: 50, buyQty: 1, getQty: 1 });
    expect(discountAmount(d, [line("a", 4000), line("b", 2000)])).toBe(1000);
  });
  it("refuse un code programmé, expiré, épuisé ou sous le minimum", () => {
    const tomorrow = new Date(Date.now() + 86400_000), yesterday = new Date(Date.now() - 86400_000);
    expect(discountProblem(discount({ startsAt: tomorrow }), 10000)).toMatch(/pas encore actif/);
    expect(discountProblem(discount({ endsAt: yesterday }), 10000)).toMatch(/expiré/);
    expect(discountProblem(discount({ usageLimit: 3, usageCount: 3 }), 10000)).toMatch(/nombre maximum/);
    expect(discountProblem(discount({ minSubtotalCents: 5000 }), 4000)).toMatch(/trop bas/);
    expect(discountProblem(discount({ active: false }), 10000)).toMatch(/n'existe pas/);
    expect(discountProblem(discount({}), 10000)).toBeNull();
  });
  it("explique ce qui manque pour une offre « Achetez X »", () => {
    const d = discount({ type: "bxgy", value: 100, buyQty: 2, getQty: 1 });
    expect(discountProblem(d, 5600, [line("bol", 2800, 2)])).toMatch(/Ajoutez 3 articles/);
  });
});

describe("remboursements", () => {
  it("ne rembourse jamais plus que ce qui a été payé", () => {
    expect(refundableCents({ totalCents: 5000, refundedCents: 2000 })).toBe(3000);
    expect(refundableCents({ totalCents: 5000, refundedCents: 6000 })).toBe(0);
  });
  it("répartit la remise de la commande sur l'article remboursé", () => {
    expect(suggestedItemRefund({ subtotalCents: 10000, discountCents: 1000 }, 4000, 1)).toBe(3600);
  });
});

describe("tarifs d'expédition", () => {
  it("propose un tarif selon le poids et le montant du panier (bornes incluses)", async () => {
    const { rateMatches } = await import("@/lib/pricing");
    const r = (o: Partial<{ minWeightGrams: number; maxWeightGrams: number; minSubtotalCents: number; maxSubtotalCents: number }>) => ({ minWeightGrams: null, maxWeightGrams: null, minSubtotalCents: null, maxSubtotalCents: null, ...o });
    expect(rateMatches(r({ maxWeightGrams: 1000 }), 1000, 0)).toBe(true);
    expect(rateMatches(r({ maxWeightGrams: 1000 }), 1001, 0)).toBe(false);
    expect(rateMatches(r({ minWeightGrams: 1001, maxWeightGrams: 5000 }), 3000, 0)).toBe(true);
    expect(rateMatches(r({ minSubtotalCents: 5000 }), 0, 4999)).toBe(false);
    expect(rateMatches(r({}), 99999, 0)).toBe(true);
  });
});

describe("TVA selon le pays de livraison", () => {
  it("applique le taux du pays dans l'UE, 0 % à l'export, et rien ne change sans l'option", async () => {
    const { vatRateFor } = await import("@/lib/tax");
    const oss = { taxRateBps: 2000, vatByCountry: true };
    expect(vatRateFor(oss, "France")).toBe(2000);
    expect(vatRateFor(oss, "Belgique")).toBe(2100);
    expect(vatRateFor(oss, "Allemagne")).toBe(1900);
    expect(vatRateFor(oss, "Luxembourg")).toBe(1700);
    expect(vatRateFor(oss, "Suisse")).toBe(0); // export
    expect(vatRateFor(oss, "États-Unis")).toBe(0);
    expect(vatRateFor(oss, "Monaco")).toBe(2000);
    expect(vatRateFor(oss, "Martinique")).toBe(850);
    expect(vatRateFor({ taxRateBps: 2000, vatByCountry: false }, "Belgique")).toBe(2000);
    expect(vatRateFor({ taxRateBps: 550, vatByCountry: true }, "Belgique")).toBe(550); // taux réduit : option inactive
  });
});
