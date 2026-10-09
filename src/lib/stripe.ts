import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

/** Le client Stripe, ou null quand aucune clé n'est configurée (paiement de démonstration). */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) client = new Stripe(key);
  return client;
}

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);
export const isTestMode = () => (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");

export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Commission de la plateforme en %, bornée entre 0 et 50. */
export const feePercent = () => Math.max(0, Math.min(50, Number(process.env.PLATFORM_FEE_PERCENT ?? "2") || 0));

export function platformFee(totalCents: number) {
  return Math.round((totalCents * feePercent()) / 100);
}

/**
 * Paiement de démonstration (commande validée sans paiement) : autorisé en développement,
 * ou en production seulement si ALLOW_DEMO_PAYMENTS=1 (boutique de test).
 */
export const demoPaymentsAllowed = () => process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_PAYMENTS === "1";
