import { formatMoney } from "./money";

/** Conditions possibles d'un segment (partagé avec l'éditeur côté navigateur). */
export const SEGMENT_FIELDS = {
  orders: { label: "Nombre de commandes", ops: { gte: "au moins", lte: "au plus", eq: "exactement" }, input: "number" },
  spent: { label: "Total dépensé", ops: { gte: "au moins", lte: "au plus" }, input: "money" },
  avg: { label: "Panier moyen", ops: { gte: "au moins", lte: "au plus" }, input: "money" },
  lastOrder: { label: "Dernière commande", ops: { within: "il y a moins de (jours)", before: "il y a plus de (jours)", never: "jamais commandé" }, input: "days" },
  created: { label: "Client depuis", ops: { within: "moins de (jours)", before: "plus de (jours)" }, input: "days" },
  marketing: { label: "Abonné à la newsletter", ops: { yes: "oui", no: "non" }, input: "none" },
  tag: { label: "Étiquette", ops: { has: "est", not: "n'est pas" }, input: "text" },
  product: { label: "Produit acheté", ops: { bought: "inclut", not: "n'inclut pas" }, input: "product" },
  country: { label: "Pays de livraison", ops: { is: "est", not: "n'est pas" }, input: "text" },
  points: { label: "Points de fidélité", ops: { gte: "au moins", lte: "au plus" }, input: "number" },
} as const;
export type SegmentField = keyof typeof SEGMENT_FIELDS;


export type RuleLike = { field: SegmentField; op: string; value: string };

/** Une condition en français, ex. « Total dépensé au moins 200,00 € ». */
export function describeRule(r: RuleLike, currency: string, productTitle?: string) {
  const f = SEGMENT_FIELDS[r.field];
  const op = (f.ops as Record<string, string>)[r.op] ?? r.op;
  if (r.op === "never" || f.input === "none") return `${f.label} : ${op}`;
  const v = f.input === "money" ? formatMoney(Number(r.value), currency) : f.input === "product" ? `« ${productTitle ?? "produit supprimé"} »` : r.value;
  return `${f.label} ${op.replace(" (jours)", "")} ${v}${f.input === "days" ? " jours" : ""}`;
}
