/**
 * Formatage des prix comme Shopify : montants en centimes, formats "{{amount}} €", "€{{amount_no_decimals}}"…
 * Le taux `rate` convertit vers la devise d'affichage (marchés) avant formatage.
 */
import { toNum } from "./drops";

export type MoneyConfig = { format: string; formatWithCurrency: string; currency: string; rate: number };

const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/g;

function group(int: string, sep: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** Variante d'un montant (en unités, déjà converti) selon le nom du placeholder Shopify. */
function placeholder(name: string, units: number): string {
  const neg = units < 0 ? "-" : "";
  const abs = Math.abs(units);
  const fixed = (d: number) => abs.toFixed(d);
  const [int, dec] = fixed(2).split(".");
  switch (name) {
    case "amount": return `${neg}${group(int, ",")}.${dec}`;
    case "amount_no_decimals": return `${neg}${group(Math.round(abs).toString(), ",")}`;
    case "amount_with_comma_separator": return `${neg}${group(int, ".")},${dec}`;
    case "amount_no_decimals_with_comma_separator": return `${neg}${group(Math.round(abs).toString(), ".")}`;
    case "amount_with_space_separator": return `${neg}${group(int, " ")},${dec}`;
    case "amount_no_decimals_with_space_separator": return `${neg}${group(Math.round(abs).toString(), " ")}`;
    case "amount_with_apostrophe_separator": return `${neg}${group(int, "'")}.${dec}`;
    case "amount_with_period_and_space_separator": return `${neg}${group(int, " ")}.${dec}`;
    case "amount_no_decimals_with_apostrophe_separator": return `${neg}${group(Math.round(abs).toString(), "'")}`;
    default: return `${neg}${group(int, ",")}.${dec}`;
  }
}

/** Formate des centimes avec un format Shopify. `trailingZeros: false` retire ",00" / ".00" (money_without_trailing_zeros). */
export function formatMoney(cents: unknown, format: string, rate = 1, trailingZeros = true): string {
  const units = (toNum(cents) * (rate || 1)) / 100;
  let out = format.replace(PLACEHOLDER, (_, name: string) => placeholder(name, units));
  if (!trailingZeros) out = out.replace(/([.,])00(?!\d)/, "");
  return out;
}

/** `money_without_currency` : seul le nombre, avec le séparateur décimal du format. */
export function formatAmountOnly(cents: unknown, format: string, rate = 1): string {
  const m = PLACEHOLDER.exec(format);
  PLACEHOLDER.lastIndex = 0;
  return placeholder(m?.[1] ?? "amount", (toNum(cents) * (rate || 1)) / 100);
}
