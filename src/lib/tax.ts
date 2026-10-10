/** TVA comprise dans un montant TTC. */
export const includedTax = (ttcCents: number, rateBps: number) => (rateBps > 0 ? Math.round(ttcCents - ttcCents / (1 + rateBps / 10000)) : 0);

export const TAX_RATES = [
  { bps: 2000, label: "20 % (taux normal)" },
  { bps: 1000, label: "10 % (taux intermédiaire)" },
  { bps: 550, label: "5,5 % (taux réduit)" },
  { bps: 210, label: "2,1 % (taux particulier)" },
  { bps: 0, label: "Pas de TVA (franchise en base, micro-entreprise)" },
] as const;

export const rateLabel = (bps: number) => `${(bps / 100).toLocaleString("fr-FR")} %`;
export const FRANCHISE_MENTION = "TVA non applicable, article 293 B du CGI";

/**
 * Taux normaux de TVA des pays de l'Union européenne (en points de base), au 1er janvier 2026.
 * À vérifier chaque année : les taux évoluent (voir la page « Taux de TVA » de la Commission européenne).
 */
export const EU_VAT_BPS: Record<string, number> = {
  Allemagne: 1900, Autriche: 2000, Belgique: 2100, Bulgarie: 2000, Chypre: 1900, Croatie: 2500, Danemark: 2500, Espagne: 2100,
  Estonie: 2400, Finlande: 2550, France: 2000, Grèce: 2400, Hongrie: 2700, Irlande: 2300, Italie: 2200, Lettonie: 2100,
  Lituanie: 2100, Luxembourg: 1700, Malte: 1800, "Pays-Bas": 2100, Pologne: 2300, Portugal: 2300, "République tchèque": 2100,
  Roumanie: 2100, Slovaquie: 2300, Slovénie: 2200, Suède: 2500,
};
/** Territoires français à régime particulier : Monaco suit la France ; DOM à 8,5 % ; Guyane sans TVA. */
const FRENCH_SPECIAL: Record<string, number | "store"> = { Monaco: "store", "La Réunion": 850, Guadeloupe: 850, Martinique: 850, Guyane: 0, Mayotte: 0 };

/**
 * Taux de TVA d'une vente. Sans l'option « TVA selon le pays », le taux de la boutique.
 * Avec l'option (boutique au taux normal) : taux normal du pays de livraison dans l'UE, régimes français particuliers,
 * et 0 % pour une livraison hors de l'UE (exportation). Les prix affichés, TTC, ne changent pas.
 */
export function vatRateFor(store: { taxRateBps: number; vatByCountry: boolean }, country: string | null | undefined) {
  const c = (country ?? "").trim();
  if (!store.vatByCountry || store.taxRateBps !== 2000 || !c || c === "France") return store.taxRateBps;
  const special = FRENCH_SPECIAL[c];
  if (special !== undefined) return special === "store" ? store.taxRateBps : special;
  return EU_VAT_BPS[c] ?? 0;
}
