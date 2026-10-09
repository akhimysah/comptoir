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
