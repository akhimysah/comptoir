export type Interval = "week" | "month";
export const INTERVAL_LABEL: Record<Interval, string> = { week: "toutes les semaines", month: "tous les mois" };
export const SUB_SUFFIX = ":abonnement";

/** Dans le panier, un article en abonnement est stocké sous « idVariante:abonnement ». */
export const splitCartId = (id: string) => (id.endsWith(SUB_SUFFIX) ? { variantId: id.slice(0, -SUB_SUFFIX.length), subscribe: true } : { variantId: id, subscribe: false });

export function nextDate(from: Date, interval: string) {
  const d = new Date(from);
  if (interval === "week") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

export const subPrice = (priceCents: number, discountBps: number) => Math.round(priceCents * (1 - discountBps / 10000));
