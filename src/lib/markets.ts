import "server-only";
import type { Market, Store } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db } from "./db";
import { isLocale, type Locale } from "./i18n";
import { parseJson } from "./utils";

/**
 * Marchés (comme sur Shopify) : le visiteur est rattaché à un marché selon le pays qu'il a choisi (cookie),
 * le pays de livraison au paiement, ou la région de son navigateur. Le marché fixe la devise, la langue
 * et un ajustement des prix (+5 %, −10 %…). Sans marché correspondant : réglages de la boutique, prix inchangés.
 */
export const marketCookie = (storeId: string) => `mk_${storeId}`;

/** Codes pays (navigateur) → nom de pays utilisé dans la plateforme. */
const REGION_TO_COUNTRY: Record<string, string> = { FR: "France", BE: "Belgique", CH: "Suisse", LU: "Luxembourg", MC: "Monaco", DE: "Allemagne", ES: "Espagne", IT: "Italie", PT: "Portugal", NL: "Pays-Bas", GB: "Royaume-Uni", IE: "Irlande", AT: "Autriche", SE: "Suède", DK: "Danemark", PL: "Pologne", CA: "Canada", US: "États-Unis", MA: "Maroc", DZ: "Algérie", TN: "Tunisie", SN: "Sénégal", CI: "Côte d'Ivoire", CM: "Cameroun" };

export const marketCountries = (m: Pick<Market, "countries">) => parseJson<string[]>(m.countries, []);

/** Prix ajusté pour un marché (arrondi au centime). */
export const adjustPrice = (cents: number, bps: number) => (bps ? Math.round(cents * (1 + bps / 10000)) : cents);

export const storeMarkets = cache(async (storeId: string) => db.market.findMany({ where: { storeId, enabled: true }, orderBy: { position: "asc" } }));

export function marketForCountry(markets: Market[], country: string | null | undefined) {
  if (!country) return null;
  return markets.find((m) => marketCountries(m).includes(country)) ?? null;
}

/** Marché courant du visiteur : pays de livraison donné, sinon cookie, sinon région du navigateur. */
export const currentMarket = cache(async (store: Pick<Store, "id">, country?: string | null): Promise<Market | null> => {
  const markets = await storeMarkets(store.id);
  if (!markets.length) return null;
  const byCountry = marketForCountry(markets, country);
  if (byCountry) return byCountry;
  const chosen = (await cookies()).get(marketCookie(store.id))?.value;
  if (chosen) return markets.find((m) => m.id === chosen) ?? null;
  const accept = (await headers()).get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const region = part.split(";")[0].trim().split("-")[1]?.toUpperCase();
    const name = region && REGION_TO_COUNTRY[region];
    const m = name ? marketForCountry(markets, name) : null;
    if (m) return m;
  }
  return null;
});

export const marketLocale = (m: Market | null): Locale | null => (m && isLocale(m.locale) ? m.locale : null);
