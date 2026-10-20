import "server-only";
import { db } from "./db";

/**
 * Trafic de la vitrine : visites (une par session et par page), visiteurs en direct, attribution des commandes
 * (d'où venait le client : référent, campagne UTM, nombre de visites avant l'achat).
 */
export const SESSION_COOKIE = "rv_sid";
export const LIVE_WINDOW_MS = 5 * 60_000;

/** Canal d'une visite d'après le référent et l'UTM (comme la ventilation marketing de Shopify). */
export function channelOf(v: { referrer: string; utmSource: string; utmMedium: string }) {
  const src = v.utmSource.toLowerCase();
  const med = v.utmMedium.toLowerCase();
  let host = "";
  try { host = v.referrer ? new URL(v.referrer).hostname.replace(/^www\./, "") : ""; } catch {}
  if (src) {
    if (/instagram|facebook|meta|tiktok|snapchat|pinterest|youtube|x\.com|twitter/.test(src)) return `Réseaux sociaux (${src})`;
    if (/google|bing/.test(src) && /cpc|paid|ads/.test(med)) return `Publicité ${src}`;
    if (/email|newsletter|klaviyo|mail/.test(src + med)) return "E-mail";
    return `${src}${med ? ` / ${med}` : ""}`;
  }
  if (!host) return "Accès direct";
  if (/instagram|facebook|fb\.|tiktok|snapchat|pinterest|youtube|twitter|x\.com|t\.co|linkedin/.test(host)) return `Réseaux sociaux (${host.split(".")[0]})`;
  if (/google|bing|duckduckgo|qwant|yahoo|ecosia/.test(host)) return "Recherche (organique)";
  return `Site ${host}`;
}

/** Attribue une commande à la visite qui l'a produite (appelé par le paiement, juste après la création de la commande). */
export async function attributeOrder(storeId: string, orderId: string, sessionId: string | null | undefined) {
  if (!sessionId) return;
  const landing = await db.pageView.findFirst({ where: { storeId, sessionId }, orderBy: { createdAt: "asc" } });
  if (!landing) return;
  // Visites = sessions distinctes de ce visiteur ; on ne connaît que celles de cette session, donc on compte ses pages de destination.
  const visits = await db.pageView.count({ where: { storeId, sessionId, landing: true } });
  await db.order.update({ where: { id: orderId }, data: { sessionId, referrer: landing.referrer, utmSource: landing.utmSource, utmMedium: landing.utmMedium, utmCampaign: landing.utmCampaign, visitsBefore: Math.max(1, visits) } });
}

/** Date de la première visite mesurée : avant, le taux de conversion n'a pas de sens (pas de visites comptées). */
export async function measurementStart(storeId: string) {
  return (await db.pageView.findFirst({ where: { storeId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }))?.createdAt ?? null;
}

/** Visites (sessions) et pages vues sur une période. */
export async function visitStats(storeId: string, from: Date, to: Date) {
  const views = await db.pageView.findMany({ where: { storeId, createdAt: { gte: from, lt: to } }, select: { sessionId: true, landing: true, referrer: true, utmSource: true, utmMedium: true, utmCampaign: true, createdAt: true, device: true } });
  // Une visite = une session ; sa page de destination est sa première page vue (même si deux envois se sont croisés).
  const firstBySession = new Map<string, (typeof views)[number]>();
  for (const v of views) if (!firstBySession.has(v.sessionId)) firstBySession.set(v.sessionId, v);
  const landings = [...firstBySession.values()];
  return { pageViews: views.length, visits: landings.length, views, landings };
}

/** Visiteurs présents (battement de cœur dans les 5 dernières minutes). */
export async function liveVisitors(storeId: string) {
  const since = new Date(Date.now() - LIVE_WINDOW_MS);
  return db.liveVisitor.findMany({ where: { storeId, lastSeenAt: { gte: since } }, orderBy: { lastSeenAt: "desc" } });
}
