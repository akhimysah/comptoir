import "server-only";
import type { Store } from "@prisma/client";
import { feePercent, stripeConfigured } from "./stripe";

/** Forfaits proposés aux marchands : toutes les fonctionnalités dans chacun, seule la commission baisse avec le prix. */
export const PLANS = {
  essentiel: { name: "Essentiel", priceCents: 2900, feePercent: 2, perks: ["Toutes les fonctionnalités", "Commission de 2 % par vente", "Idéal pour démarrer"] },
  pro: { name: "Pro", priceCents: 7900, feePercent: 1, perks: ["Toutes les fonctionnalités", "Commission de 1 % par vente", "Plus avantageux dès 5 000 € de ventes par mois"] },
  avance: { name: "Avancé", priceCents: 29900, feePercent: 0.5, perks: ["Toutes les fonctionnalités", "Commission de 0,5 % par vente", "Plus avantageux dès 44 000 € de ventes par mois"] },
} as const;
export type PlanKey = keyof typeof PLANS;
export const isPlanKey = (k: unknown): k is PlanKey => typeof k === "string" && k in PLANS;

export const TRIAL_DAYS = 14;

/**
 * Facturation des marchands activée : clé Stripe et BILLING_ENABLED=1.
 * Sinon (développement, démonstration), toutes les boutiques vendent sans forfait.
 */
export const billingEnabled = () => stripeConfigured() && process.env.BILLING_ENABLED === "1";

type BillingFields = Pick<Store, "plan" | "planStatus" | "trialEndsAt" | "createdAt" | "planRenewsAt">;

export const trialEnd = (s: Pick<Store, "trialEndsAt" | "createdAt">) => s.trialEndsAt ?? new Date(s.createdAt.getTime() + TRIAL_DAYS * 86400_000);

/** Jours de paiement en retard tolérés avant de bloquer les ventes (le temps que Stripe relance la carte). */
const GRACE_DAYS = 7;

/** État du forfait, pour l'admin et pour autoriser les ventes. */
export function planState(s: BillingFields, now = new Date()) {
  const plan = isPlanKey(s.plan) ? PLANS[s.plan] : null;
  const end = trialEnd(s);
  if (!plan) {
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86400_000);
    return { plan: null, label: "Essai gratuit", trial: true, daysLeft: Math.max(0, daysLeft), canSell: daysLeft > 0 };
  }
  const grace = s.planRenewsAt ? s.planRenewsAt.getTime() + GRACE_DAYS * 86400_000 > now.getTime() : true;
  const canSell = s.planStatus === "active" || s.planStatus === "trialing" || (s.planStatus === "past_due" && grace) || (s.planStatus === "canceled" && Boolean(s.planRenewsAt && s.planRenewsAt > now));
  return { plan, label: plan.name, trial: false, daysLeft: 0, canSell };
}

/** La boutique peut-elle encaisser ? Toujours oui quand la facturation n'est pas activée. */
export const canSell = (s: BillingFields) => !billingEnabled() || planState(s).canSell;

/** Commission de la plateforme pour cette boutique, en % : celle de son forfait, sinon PLATFORM_FEE_PERCENT. */
export function storeFeePercent(s: Pick<Store, "plan" | "planStatus">) {
  if (billingEnabled() && isPlanKey(s.plan) && s.planStatus !== "canceled") return PLANS[s.plan].feePercent;
  return feePercent();
}

export const storePlatformFee = (s: Pick<Store, "plan" | "planStatus">, totalCents: number) => Math.round((totalCents * storeFeePercent(s)) / 100);

/** Message montré au client quand la boutique ne peut pas encaisser (essai terminé, forfait impayé). */
export const SALES_PAUSED = { fr: "Cette boutique ne prend pas de commande pour le moment.", en: "This store is not taking orders at the moment." } as const;
