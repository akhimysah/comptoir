import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canSell, planState, storeFeePercent, storePlatformFee } from "@/lib/billing";

/** Forfaits des marchands : essai gratuit, ventes suspendues, commission selon le forfait. */
const day = 86400_000;
const store = (over: Record<string, unknown> = {}) => ({ plan: "trial", planStatus: "trialing", trialEndsAt: null, planRenewsAt: null, createdAt: new Date(Date.now() - 3 * day), ...over }) as Parameters<typeof planState>[0] & { plan: string; planStatus: string };

describe("forfaits", () => {
  const env = { ...process.env };
  beforeEach(() => { process.env.STRIPE_SECRET_KEY = "sk_test_x"; process.env.BILLING_ENABLED = "1"; process.env.PLATFORM_FEE_PERCENT = "2"; });
  afterEach(() => { process.env = { ...env }; });

  it("laisse 14 jours d'essai, puis suspend les ventes sans forfait", () => {
    expect(planState(store()).daysLeft).toBe(11);
    expect(canSell(store())).toBe(true);
    expect(canSell(store({ createdAt: new Date(Date.now() - 15 * day) }))).toBe(false);
  });

  it("garde la boutique ouverte jusqu'à la fin du mois payé après résiliation, et quelques jours en cas d'impayé", () => {
    expect(canSell(store({ plan: "pro", planStatus: "active" }))).toBe(true);
    expect(canSell(store({ plan: "pro", planStatus: "canceled", planRenewsAt: new Date(Date.now() + 5 * day) }))).toBe(true);
    expect(canSell(store({ plan: "pro", planStatus: "canceled", planRenewsAt: new Date(Date.now() - day) }))).toBe(false);
    expect(canSell(store({ plan: "pro", planStatus: "past_due", planRenewsAt: new Date(Date.now() - 2 * day) }))).toBe(true);
    expect(canSell(store({ plan: "pro", planStatus: "past_due", planRenewsAt: new Date(Date.now() - 10 * day) }))).toBe(false);
  });

  it("prélève la commission du forfait", () => {
    expect(storeFeePercent(store({ plan: "avance", planStatus: "active" }))).toBe(0.5);
    expect(storePlatformFee(store({ plan: "pro", planStatus: "active" }), 10000)).toBe(100);
    expect(storeFeePercent(store())).toBe(2); // essai : commission par défaut
  });

  it("ne bloque rien quand la facturation n'est pas activée", () => {
    delete process.env.BILLING_ENABLED;
    expect(canSell(store({ createdAt: new Date(Date.now() - 400 * day) }))).toBe(true);
    expect(storeFeePercent(store({ plan: "avance", planStatus: "active" }))).toBe(2);
  });
});
