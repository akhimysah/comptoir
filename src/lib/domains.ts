import "server-only";
import { randomBytes } from "crypto";
import { resolveTxt } from "dns/promises";
import { isIP } from "net";
import { db } from "./db";
import { appUrl } from "./stripe";

/** Nom d'hôte de la plateforme (admin, pages /s/…). */
export const platformHost = () => new URL(appUrl()).hostname.toLowerCase();

/** Hôtes qui ne sont jamais des domaines de boutique (plateforme, local, aperçus de l'hébergeur). */
export function isPlatformHost(host: string) {
  return host === platformHost() || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app") || isIP(host) !== 0;
}

/** Nom de domaine saisi par le marchand → forme normalisée (« www.maboutique.fr »), ou null s'il est invalide. */
export function normalizeDomain(input: string) {
  const host = input.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/\.$/, "");
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(host)) return null;
  if (isIP(host) || isPlatformHost(host)) return null;
  return host;
}

/** Domaines de test locaux (*.localhost) : servis sans vérification DNS, seulement hors production. */
export const isLocalTestDomain = (host: string) => process.env.NODE_ENV !== "production" && host.endsWith(".localhost");

/** Adresse publique de la boutique : son domaine vérifié, sinon /s/<boutique> sur la plateforme. */
export function storeBase(store: { slug: string; domain: string | null; domainVerifiedAt: Date | null }) {
  if (store.domain && store.domainVerifiedAt) {
    if (isLocalTestDomain(store.domain)) return `http://${store.domain}${new URL(appUrl()).port ? `:${new URL(appUrl()).port}` : ""}`;
    return `https://${store.domain}`;
  }
  return `${appUrl()}/s/${store.slug}`;
}

/** Même chose à partir du seul identifiant de boutique (liens envoyés par e-mail, redirections de paiement). */
export async function storeBaseBySlug(slug: string) {
  const s = await db.store.findUnique({ where: { slug }, select: { slug: true, domain: true, domainVerifiedAt: true } });
  return s ? storeBase(s) : `${appUrl()}/s/${slug}`;
}

export const newDomainToken = () => `parnassa-verification=${randomBytes(12).toString("hex")}`;
export const txtRecordName = (domain: string) => `_parnassa.${domain}`;
/** Cible du CNAME que le marchand crée chez son registraire. */
export const cnameTarget = () => process.env.DOMAIN_CNAME_TARGET || platformHost();

/** Vérifie l'enregistrement TXT. Renvoie null si c'est bon, sinon le problème à afficher. */
export async function checkDomainTxt(domain: string, token: string): Promise<string | null> {
  if (isLocalTestDomain(domain)) return null;
  const records = await resolveTxt(txtRecordName(domain)).catch(() => null);
  if (!records) return `Aucun enregistrement TXT trouvé pour ${txtRecordName(domain)}. La propagation DNS peut prendre jusqu'à quelques heures.`;
  if (!records.some((r) => r.join("") === token)) return `L'enregistrement TXT de ${txtRecordName(domain)} ne contient pas la bonne valeur.`;
  return null;
}

/**
 * Ajoute le domaine au projet chez l'hébergeur pour obtenir le certificat HTTPS
 * (Vercel, si VERCEL_TOKEN et VERCEL_PROJECT_ID sont configurés). Sinon, à faire à la main.
 */
export async function attachDomainToHost(domain: string): Promise<"added" | "manual" | "failed"> {
  const token = process.env.VERCEL_TOKEN, project = process.env.VERCEL_PROJECT_ID;
  if (!token || !project || isLocalTestDomain(domain)) return "manual";
  const team = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";
  const res = await fetch(`https://api.vercel.com/v10/projects/${project}/domains${team}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: domain }), signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  // 409 : déjà ajouté au projet.
  return res && (res.ok || res.status === 409) ? "added" : "failed";
}

export async function detachDomainFromHost(domain: string) {
  const token = process.env.VERCEL_TOKEN, project = process.env.VERCEL_PROJECT_ID;
  if (!token || !project || isLocalTestDomain(domain)) return;
  const team = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";
  await fetch(`https://api.vercel.com/v9/projects/${project}/domains/${domain}${team}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
}

// Cache du proxy : domaine → boutique, gardé une minute (y compris « aucune boutique »).
const cache = new Map<string, { slug: string | null; until: number }>();

/** Boutique servie sur ce domaine (vérifié), ou null. */
export async function slugForDomain(host: string) {
  const hit = cache.get(host);
  if (hit && hit.until > Date.now()) return hit.slug;
  const s = await db.store.findUnique({ where: { domain: host }, select: { slug: true, domainVerifiedAt: true } }).catch(() => null);
  const slug = s?.domainVerifiedAt ? s.slug : null;
  if (cache.size > 5000) cache.clear();
  cache.set(host, { slug, until: Date.now() + 60_000 });
  return slug;
}
export const forgetDomain = (host: string) => cache.delete(host);
