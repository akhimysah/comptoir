/**
 * Analyse du risque d'une commande (comme la carte « Analyse du risque » de Shopify).
 * Fonction pure : aucune lecture en base, le contexte est fourni par l'appelant.
 *
 * Heuristiques, volontairement simples et explicables (chaque indice ajoute un point ;
 * un historique sain en retire un) :
 *  - première commande de cette adresse ET total supérieur à 3 × le panier moyen de la boutique ;
 *  - pays de livraison différent du pays de la boutique ;
 *  - adresse e-mail jetable (yopmail, mailinator, guerrillamail, 10minutemail, tempmail…) ;
 *  - plus de 2 commandes de la même adresse e-mail en 24 h ;
 *  - commandes précédentes annulées ou remboursées : −1 (client connu, litiges déjà traités) ;
 *  - paiement par carte via Stripe : simple note (3D Secure / Stripe Radar ont déjà vérifié le paiement).
 * Score ≤ 0 : faible ; 1 : moyen ; ≥ 2 : élevé.
 */

export type RiskLevel = "low" | "medium" | "high";

export type RiskOrder = {
  email: string;
  totalCents: number;
  paymentMethod: string;
  stripePaymentIntentId: string | null;
  /** JSON de l'adresse de livraison ({ country }) ou objet déjà analysé. */
  address: string | { country?: string };
};

export type RiskContext = {
  /** Nombre de commandes passées par cette adresse e-mail AVANT celle-ci. */
  previousOrders: number;
  /** Panier moyen de la boutique, en centimes (0 si inconnu). */
  averageOrderCents: number;
  /** Pays de la boutique (nom ou code), pour comparer avec l'adresse de livraison. */
  storeCountry: string;
  /** Commandes de la même adresse e-mail dans les 24 h (celle-ci comprise). */
  ordersLast24h: number;
  /** Commandes précédentes annulées ou remboursées. */
  cancelledOrRefunded: number;
};

/** Domaines d'adresses jetables les plus courants. */
export const DISPOSABLE_DOMAINS = ["yopmail", "mailinator", "guerrillamail", "10minutemail", "tempmail", "temp-mail", "throwawaymail", "trashmail", "getnada", "dispostable"];

const normCountry = (c: string) => c.trim().toLowerCase().replace(/[\s-]+/g, "");
/** « France », « FR » et « france » désignent le même pays. */
const sameCountry = (a: string, b: string) => {
  const x = normCountry(a);
  const y = normCountry(b);
  if (!x || !y) return true; // pays inconnu : on ne conclut rien
  return x === y || (x.length === 2 && y.startsWith(x)) || (y.length === 2 && x.startsWith(y));
};

export const isDisposableEmail = (email: string) => {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return DISPOSABLE_DOMAINS.some((d) => domain.includes(d));
};

export function assessRisk(order: RiskOrder, ctx: RiskContext): { level: RiskLevel; notes: string[] } {
  const notes: string[] = [];
  let score = 0;
  let country = "";
  if (typeof order.address === "string") {
    try { country = String((JSON.parse(order.address) as { country?: string })?.country ?? ""); } catch { country = ""; }
  } else country = order.address.country ?? "";

  if (ctx.previousOrders === 0 && ctx.averageOrderCents > 0 && order.totalCents > 3 * ctx.averageOrderCents) {
    score++;
    notes.push("Première commande de ce client, d'un montant bien supérieur au panier moyen de la boutique.");
  }
  if (country && !sameCountry(country, ctx.storeCountry)) {
    score++;
    notes.push(`L'adresse de livraison (${country.trim()}) est dans un autre pays que la boutique.`);
  }
  if (isDisposableEmail(order.email)) {
    score++;
    notes.push("L'adresse e-mail semble jetable (service d'adresses temporaires).");
  }
  if (ctx.ordersLast24h > 2) {
    score++;
    notes.push(`${ctx.ordersLast24h} commandes passées avec cette adresse e-mail en 24 heures.`);
  }
  if (ctx.cancelledOrRefunded > 0) {
    score--;
    notes.push(`Client connu : ${ctx.cancelledOrRefunded} commande${ctx.cancelledOrRefunded > 1 ? "s" : ""} précédente${ctx.cancelledOrRefunded > 1 ? "s" : ""} annulée${ctx.cancelledOrRefunded > 1 ? "s" : ""} ou remboursée${ctx.cancelledOrRefunded > 1 ? "s" : ""}, déjà traitée${ctx.cancelledOrRefunded > 1 ? "s" : ""}.`);
  }
  if (order.paymentMethod === "stripe" && order.stripePaymentIntentId) {
    notes.push("Paiement par carte vérifié par Stripe (3D Secure / Stripe Radar).");
  }
  if (!notes.length) notes.push("Aucun indice de fraude détecté.");
  const level: RiskLevel = score >= 2 ? "high" : score === 1 ? "medium" : "low";
  return { level, notes };
}

export const RISK_LABELS: Record<RiskLevel, string> = { low: "faible", medium: "moyen", high: "élevé" };
export const isRiskLevel = (s: string): s is RiskLevel => s === "low" || s === "medium" || s === "high";
