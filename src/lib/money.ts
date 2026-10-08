export function formatMoney(cents: number, currency = "EUR") {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** "12,50" ou "12.5" -> 1250. Renvoie null si la saisie n'est pas un montant. */
export function parseMoney(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === "") return null;
  const n = typeof input === "number" ? input : parseFloat(String(input).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export const centsToInput = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "" : (cents / 100).toFixed(2);
