import "server-only";
import type { Store } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { isLocale, type Locale } from "./i18n";
import { parseJson } from "./utils";

export const langCookie = (storeId: string) => `lang_${storeId}`;

/** Langues proposées par la boutique ; la première est sa langue principale. */
export function storeLocales(store: Pick<Store, "languages">): Locale[] {
  const list = parseJson<unknown[]>(store.languages, ["fr"]).filter(isLocale);
  return list.length ? [...new Set(list)] : ["fr"];
}

/**
 * Langue du visiteur : celle qu'il a choisie, sinon celle de son navigateur si la boutique la propose,
 * sinon la langue principale de la boutique.
 */
export const getLocale = cache(async (store: Pick<Store, "id" | "languages">): Promise<Locale> => {
  const available = storeLocales(store);
  if (available.length === 1) return available[0];
  const chosen = (await cookies()).get(langCookie(store.id))?.value;
  if (isLocale(chosen) && available.includes(chosen)) return chosen;
  const accept = (await headers()).get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const code = part.split(";")[0].trim().slice(0, 2).toLowerCase();
    if (isLocale(code) && available.includes(code)) return code;
  }
  return available[0];
});

/**
 * Titres des articles d'une commande dans la langue du client (affichage seulement : la commande
 * garde les titres dans la langue de la boutique, celle que voit le marchand).
 */
export async function localizeItems<T extends { variantId: string | null; productTitle: string }>(items: T[], locale: Locale): Promise<T[]> {
  if (locale === "fr") return items;
  const { db } = await import("./db");
  const { translate } = await import("./i18n");
  const variants = await db.variant.findMany({ where: { id: { in: items.map((i) => i.variantId).filter((v): v is string => !!v) } }, select: { id: true, product: { select: { title: true, translations: true } } } });
  const title = new Map(variants.map((v) => [v.id, translate(v.product, locale, ["title"]).title]));
  return items.map((i) => (i.variantId && title.has(i.variantId) ? { ...i, productTitle: title.get(i.variantId)! } : i));
}
