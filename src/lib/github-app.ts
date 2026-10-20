import "server-only";
import { createSign } from "crypto";
import { db } from "./db";
import { open, seal } from "./secret-box";
import { appUrl } from "./stripe";

/**
 * Application GitHub de la plateforme : les marchands se connectent à GitHub en un clic (comme sur Shopify),
 * sans créer de jeton. Identifiants dans l'environnement (GITHUB_APP_*) ou créés depuis l'admin de la plateforme
 * (manifeste GitHub) et gardés chiffrés en base.
 */
export const GH_API = () => (process.env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "");
export const GH_WEB = () => (process.env.GITHUB_WEB_URL ?? "https://github.com").replace(/\/$/, "");

export type AppConfig = { appId: string; slug: string; privateKey: string; clientId: string; clientSecret: string; webhookSecret: string; owner?: string };

const SETTING = "github_app";

export async function appConfig(): Promise<AppConfig | null> {
  const e = process.env;
  if (e.GITHUB_APP_ID && e.GITHUB_APP_PRIVATE_KEY && e.GITHUB_APP_SLUG) {
    return { appId: e.GITHUB_APP_ID, slug: e.GITHUB_APP_SLUG, privateKey: e.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"), clientId: e.GITHUB_APP_CLIENT_ID ?? "", clientSecret: e.GITHUB_APP_CLIENT_SECRET ?? "", webhookSecret: e.GITHUB_APP_WEBHOOK_SECRET ?? "" };
  }
  const row = await db.platformSetting.findUnique({ where: { key: SETTING } });
  if (!row) return null;
  try { return JSON.parse(open(row.value)) as AppConfig; } catch { return null; }
}

export const saveAppConfig = (c: AppConfig) => db.platformSetting.upsert({ where: { key: SETTING }, update: { value: seal(JSON.stringify(c)) }, create: { key: SETTING, value: seal(JSON.stringify(c)) } });
export const forgetAppConfig = () => db.platformSetting.deleteMany({ where: { key: SETTING } });

/** JWT de l'application (RS256, 9 minutes), pour demander des jetons d'installation. */
export function appJwt(c: AppConfig) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iat: now - 60, exp: now + 540, iss: c.appId })}`;
  return `${body}.${createSign("RSA-SHA256").update(body).sign(c.privateKey).toString("base64url")}`;
}

async function call<T>(path: string, auth: string, init: { method?: string; body?: unknown; base?: string } = {}): Promise<T> {
  const res = await fetch(`${init.base ?? GH_API()}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: auth, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "RevolutionEcom", ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(json.message ?? `GitHub ${res.status}`);
  return json;
}

// Jetons d'installation (valables 1 h) gardés en mémoire jusqu'à 5 minutes avant leur expiration.
const tokens = new Map<number, { token: string; until: number }>();

export async function installationToken(installationId: number) {
  const hit = tokens.get(installationId);
  if (hit && hit.until > Date.now()) return hit.token;
  const c = await appConfig();
  if (!c) throw new Error("L'application GitHub de la plateforme n'est pas configurée.");
  const r = await call<{ token: string; expires_at: string }>(`/app/installations/${installationId}/access_tokens`, `Bearer ${appJwt(c)}`, { method: "POST" });
  tokens.set(installationId, { token: r.token, until: new Date(r.expires_at).getTime() - 5 * 60_000 });
  return r.token;
}

/** Dépôts auxquels l'installation donne accès (ceux choisis par le marchand sur GitHub). */
export async function installationRepos(installationId: number) {
  const token = await installationToken(installationId);
  const r = await call<{ repositories: { full_name: string; default_branch: string; private: boolean }[] }>(`/installation/repositories?per_page=100`, `Bearer ${token}`);
  return r.repositories.map((x) => ({ name: x.full_name, defaultBranch: x.default_branch, private: x.private }));
}

/** Compte GitHub (utilisateur ou organisation) sur lequel l'application est installée. */
export async function installationAccount(installationId: number) {
  const c = await appConfig();
  if (!c) return null;
  const r = await call<{ account?: { login?: string; type?: string } }>(`/app/installations/${installationId}`, `Bearer ${appJwt(c)}`).catch(() => null);
  return r?.account?.login ?? null;
}

export async function repoBranches(installationId: number, repo: string) {
  const token = await installationToken(installationId);
  return (await call<{ name: string }[]>(`/repos/${repo}/branches?per_page=100`, `Bearer ${token}`)).map((b) => b.name);
}

/**
 * Retour de GitHub après l'installation : le code OAuth prouve qui est l'utilisateur, et on vérifie que
 * l'installation reçue lui est bien accessible (sinon n'importe qui pourrait relier l'installation d'un autre).
 */
export async function verifyInstallationOwner(code: string, installationId: number) {
  const c = await appConfig();
  if (!c?.clientId || !c.clientSecret) throw new Error("Identifiants OAuth de l'application GitHub manquants.");
  const res = await fetch(`${GH_WEB()}/login/oauth/access_token`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ client_id: c.clientId, client_secret: c.clientSecret, code }), signal: AbortSignal.timeout(15_000) });
  const { access_token } = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!access_token) throw new Error("GitHub n'a pas confirmé la connexion. Réessayez.");
  const list = await call<{ installations: { id: number }[] }>(`/user/installations?per_page=100`, `Bearer ${access_token}`);
  return list.installations.some((i) => i.id === installationId);
}

/** Manifeste de création de l'application (bouton « Créer l'application GitHub » de l'admin de la plateforme). */
export function appManifest(name: string) {
  const base = appUrl();
  const reachable = base.startsWith("https://") && !base.includes("localhost");
  return {
    name,
    url: base,
    description: "Synchronise le thème de votre boutique Revolution Ecom avec un dépôt GitHub.",
    public: true, // installable par tous les marchands
    redirect_url: `${base}/api/github/manifest`,
    callback_urls: [`${base}/api/github/setup`],
    setup_url: `${base}/api/github/setup`,
    request_oauth_on_install: true,
    setup_on_update: true,
    hook_attributes: { url: `${base}/api/github/webhook`, active: reachable },
    default_permissions: { contents: "write", metadata: "read" },
    default_events: reachable ? ["push"] : [],
  };
}

/** Étape finale du manifeste : GitHub renvoie un code échangé contre les identifiants de l'application. */
export async function convertManifest(code: string) {
  const res = await fetch(`${GH_API()}/app-manifests/${encodeURIComponent(code)}/conversions`, { method: "POST", headers: { Accept: "application/vnd.github+json", "User-Agent": "RevolutionEcom" }, signal: AbortSignal.timeout(15_000) });
  const r = (await res.json().catch(() => ({}))) as { id?: number; slug?: string; pem?: string; client_id?: string; client_secret?: string; webhook_secret?: string | null; owner?: { login?: string }; message?: string };
  if (!res.ok || !r.id || !r.slug || !r.pem) throw new Error(r.message ?? "GitHub n'a pas créé l'application.");
  const cfg: AppConfig = { appId: String(r.id), slug: r.slug, privateKey: r.pem, clientId: r.client_id ?? "", clientSecret: r.client_secret ?? "", webhookSecret: r.webhook_secret ?? "", owner: r.owner?.login };
  await saveAppConfig(cfg);
  return cfg;
}
