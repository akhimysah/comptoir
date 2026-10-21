import "server-only";
import { db } from "../db";
import { previewCookie } from "../storefront";

/** Chemins de la boutique toujours servis par l'app React, même sous un thème Shopify (paiement, compte, mesure…). */
const NATIVE = /^\/(track|vitals|assets|preview|pay|order|account|currency|lang|market|feeds|sitemap\.xml|robots\.txt|unsubscribe|password|reviews|stock-alert|chat|favorites|liquid)(\/|$)/;

const cache = new Map<string, { until: number; value: string | null }>();
const remember = (key: string, value: string | null) => { if (cache.size > 2000) cache.clear(); cache.set(key, { until: Date.now() + 30_000, value }); return value; };
const cached = (key: string) => { const hit = cache.get(key); return hit && hit.until > Date.now() ? hit : null; };

/** Moteur du thème : "liquid" pour un thème Shopify importé, sinon "native". Gardé 30 s. */
async function engineOfTheme(id: string) {
  const hit = cached(`t:${id}`);
  if (hit) return hit.value;
  const row = await db.storeTheme.findUnique({ where: { id }, select: { engine: true } }).catch(() => null);
  return remember(`t:${id}`, row?.engine ?? null);
}
async function storeInfo(slug: string) {
  const hit = cached(`s:${slug}`);
  if (hit) return hit.value ? (JSON.parse(hit.value) as { id: string; publishedThemeId: string | null }) : null;
  const row = await db.store.findUnique({ where: { slug }, select: { id: true, publishedThemeId: true } }).catch(() => null);
  remember(`s:${slug}`, row ? JSON.stringify(row) : null);
  return row;
}
export const forgetThemeEngine = (id: string) => cache.delete(`t:${id}`);
export const forgetStoreEngine = (slug: string) => cache.delete(`s:${slug}`);

/**
 * La page demandée doit-elle être rendue par le moteur Liquid ? Oui si le thème en vigueur (brouillon en aperçu
 * via ?pt= ou cookie, sinon thème publié) est un thème Shopify, et si le chemin n'est pas une page native.
 */
export async function wantsLiquid(slug: string, path: string, search: URLSearchParams, cookie: string): Promise<boolean> {
  if (NATIVE.test(path || "/")) return false;
  if (path === "/cart" && search.get("checkout") === "1") return false; // paiement natif depuis un thème Shopify
  const store = await storeInfo(slug);
  if (!store) return false;
  const pt = search.get("pt");
  const fromCookie = cookie.match(new RegExp(`(?:^|;\\s*)${previewCookie(store.id)}=([A-Za-z0-9]+)`))?.[1];
  const themeId = (pt && /^[A-Za-z0-9]{1,40}$/.test(pt) ? pt : null) ?? fromCookie ?? store.publishedThemeId;
  if (!themeId) return false;
  return (await engineOfTheme(themeId)) === "liquid";
}
