import "server-only";
import { cookies } from "next/headers";
import type { Store } from "@prisma/client";
import { parseJson } from "./utils";

export type DisplayCurrency = { code: string; rate: number };
export const CURRENCY_CHOICES = ["EUR", "USD", "GBP", "CHF", "CAD", "MAD", "XOF", "DZD", "TND", "AED", "SAR", "JPY"] as const;

export const cookieName = (storeId: string) => `cur_${storeId}`;

export function storeCurrencies(store: Store): DisplayCurrency[] {
  const extra = parseJson<DisplayCurrency[]>(store.displayCurrencies, []).filter((c) => c.code !== store.currency && c.rate > 0);
  return [{ code: store.currency, rate: 1 }, ...extra];
}

/** Devise choisie par le visiteur (cookie), ou celle de la boutique. */
export async function displayCurrency(store: Store): Promise<DisplayCurrency> {
  const all = storeCurrencies(store);
  const wanted = (await cookies()).get(cookieName(store.id))?.value;
  return all.find((c) => c.code === wanted) ?? all[0];
}

/**
 * Taux du jour de la Banque centrale européenne (via frankfurter.app), depuis la devise de la boutique.
 * Les devises non publiées par la BCE (MAD, XOF, DZD…) ne sont pas renvoyées.
 */
export async function fetchRates(base: string, codes: string[]): Promise<Record<string, number> | null> {
  if (!codes.length) return {};
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${base}&to=${codes.join(",")}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return ((await res.json()) as { rates?: Record<string, number> }).rates ?? {};
  } catch {
    return null;
  }
}

/** Met à jour les taux d'une boutique (ceux que la BCE publie) ; renvoie les devises mises à jour. */
export async function refreshStoreRates(store: Store) {
  const list = parseJson<DisplayCurrency[]>(store.displayCurrencies, []);
  const rates = await fetchRates(store.currency, list.map((c) => c.code));
  if (!rates) return null;
  const next = list.map((c) => (rates[c.code] ? { code: c.code, rate: Math.round(rates[c.code] * 10000) / 10000 } : c));
  const { db } = await import("./db");
  await db.store.update({ where: { id: store.id }, data: { displayCurrencies: JSON.stringify(next), ratesUpdatedAt: new Date() } });
  return Object.keys(rates);
}
