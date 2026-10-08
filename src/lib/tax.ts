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
