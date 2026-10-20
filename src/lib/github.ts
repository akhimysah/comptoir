import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { after } from "next/server";
import type { Store, StoreTheme } from "@prisma/client";
import { db } from "./db";
import { installationToken } from "./github-app";
import { open, seal } from "./secret-box";
import { appUrl } from "./stripe";
import { storeUpdateFromFiles, THEME_FILES, themeFiles } from "./theme-files";
import { createTheme, saveThemeRow, uniqueThemeName } from "./themes";

/**
 * Thème relié à un dépôt GitHub (comme l'intégration GitHub de Shopify) : chaque thème de la bibliothèque peut
 * suivre une branche. Modifier le thème dans l'admin fait un commit ; un push sur la branche met le thème à jour.
 */

const API = () => (process.env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "");

// Jeton chiffré en base (mode « jeton collé », en secours de l'application GitHub).
export const encryptToken = seal;
export const decryptToken = open;

export class GithubError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}

async function gh<T>(token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API()}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "RevolutionEcom", ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  }).catch(() => { throw new GithubError("GitHub ne répond pas. Réessayez plus tard."); });
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    const msg = res.status === 401 ? "Jeton GitHub refusé (expiré ou révoqué)." : res.status === 403 ? "Le jeton n'a pas les droits nécessaires sur ce dépôt." : res.status === 404 ? "Dépôt ou branche introuvable (ou jeton sans accès)." : json.message ?? `Erreur GitHub ${res.status}.`;
    throw new GithubError(msg, res.status);
  }
  return json;
}

export const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export const BRANCH_RE = /^(?!\/|.*\/\/|.*\.\.|.*\/$)[A-Za-z0-9._/-]{1,100}$/;
export const PATH_RE = /^([A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]*$/;

type Conn = { repo: string; branch: string; path: string; token: string };
/** Accès au dépôt d'un thème : jeton de l'installation de l'application GitHub, ou jeton collé. */
async function conn(theme: StoreTheme, store: Pick<Store, "githubInstallationId">): Promise<Conn | null> {
  if (!theme.githubRepo) return null;
  const base = { repo: theme.githubRepo, branch: theme.githubBranch, path: theme.githubPath };
  if (theme.githubToken) return { ...base, token: decryptToken(theme.githubToken) };
  if (store.githubInstallationId) return { ...base, token: await installationToken(store.githubInstallationId) };
  return null;
}
const full = (c: Conn, file: string) => (c.path ? `${c.path.replace(/\/$/, "")}/${file}` : file);
/** Empreinte Git d'un fichier (comme « git hash-object ») : sert à ne rien committer quand rien n'a changé. */
const blobSha = (content: string) => { const b = Buffer.from(content, "utf8"); return createHash("sha1").update(`blob ${b.length}\0`).update(b).digest("hex"); };

/** Tête de la branche ; la crée depuis la branche par défaut si elle n'existe pas. null : dépôt vide. */
async function branchHead(c: Conn): Promise<string | null> {
  try {
    return (await gh<{ object: { sha: string } }>(c.token, `/repos/${c.repo}/git/ref/heads/${c.branch}`)).object.sha;
  } catch (e) {
    if (!(e instanceof GithubError) || (e.status !== 404 && e.status !== 409)) throw e;
    const repo = await gh<{ default_branch: string }>(c.token, `/repos/${c.repo}`);
    try {
      const base = (await gh<{ object: { sha: string } }>(c.token, `/repos/${c.repo}/git/ref/heads/${repo.default_branch}`)).object.sha;
      await gh(c.token, `/repos/${c.repo}/git/refs`, { method: "POST", body: { ref: `refs/heads/${c.branch}`, sha: base } });
      return base;
    } catch (e2) {
      if (e2 instanceof GithubError && (e2.status === 404 || e2.status === 409)) return null; // dépôt encore vide
      throw e2;
    }
  }
}

/** Le dépôt a-t-il des commits que le thème n'a pas encore récupérés ? (bouton « Mettre à jour ») */
export async function isBehind(theme: StoreTheme, store: Pick<Store, "githubInstallationId">) {
  const c = await conn(theme, store);
  if (!c) return false;
  const head = await branchHead(c).catch(() => null);
  return Boolean(head && head !== theme.githubLastSha);
}

/** Envoie les fichiers du thème sur la branche en un seul commit (rien si les fichiers sont identiques). */
export async function pushTheme(theme: StoreTheme, store: Pick<Store, "githubInstallationId">, message: string): Promise<{ sha: string | null; changed: boolean }> {
  const c = await conn(theme, store);
  if (!c) throw new GithubError("Ce thème n'est pas relié à GitHub.");
  const files = themeFiles({ ...theme, name: theme.name });
  const head = await branchHead(c);
  if (!head) {
    // Dépôt vide : l'API Git n'est pas encore utilisable, le premier fichier crée la branche.
    let sha: string | null = null;
    for (const [file, content] of Object.entries(files)) {
      const r = await gh<{ commit: { sha: string } }>(c.token, `/repos/${c.repo}/contents/${full(c, file)}`, { method: "PUT", body: { message, content: Buffer.from(content).toString("base64"), branch: c.branch } });
      sha = r.commit.sha;
    }
    return { sha, changed: true };
  }
  const commit = await gh<{ tree: { sha: string } }>(c.token, `/repos/${c.repo}/git/commits/${head}`);
  const tree = await gh<{ tree: { path: string; sha: string }[] }>(c.token, `/repos/${c.repo}/git/trees/${commit.tree.sha}?recursive=1`);
  const current = new Map(tree.tree.map((t) => [t.path, t.sha]));
  const changes = Object.entries(files).filter(([file, content]) => current.get(full(c, file)) !== blobSha(content));
  if (!changes.length) return { sha: head, changed: false };
  const newTree = await gh<{ sha: string }>(c.token, `/repos/${c.repo}/git/trees`, { method: "POST", body: { base_tree: commit.tree.sha, tree: changes.map(([file, content]) => ({ path: full(c, file), mode: "100644", type: "blob", content })) } });
  const created = await gh<{ sha: string }>(c.token, `/repos/${c.repo}/git/commits`, { method: "POST", body: { message, tree: newTree.sha, parents: [head] } });
  await gh(c.token, `/repos/${c.repo}/git/refs/heads/${c.branch}`, { method: "PATCH", body: { sha: created.sha } });
  return { sha: created.sha, changed: true };
}

/** Lit les fichiers du thème sur la branche (un fichier absent vaut undefined). */
async function readFiles(c: Conn, ref: string) {
  const out: Partial<Record<string, string>> = {};
  for (const file of Object.values(THEME_FILES)) {
    try {
      const r = await gh<{ content?: string; encoding?: string }>(c.token, `/repos/${c.repo}/contents/${full(c, file)}?ref=${encodeURIComponent(ref)}`);
      if (r.content && r.encoding === "base64") out[file] = Buffer.from(r.content, "base64").toString("utf8");
    } catch (e) {
      if (!(e instanceof GithubError) || e.status !== 404) throw e;
    }
  }
  return out;
}

/** Récupère le thème depuis la branche (fichiers vérifiés comme dans l'éditeur) ; la vitrine suit s'il est publié. */
export async function pullTheme(theme: StoreTheme, store: Pick<Store, "id" | "githubInstallationId" | "publishedThemeId">): Promise<{ applied: string[]; sha: string | null }> {
  const c = await conn(theme, store);
  if (!c) throw new GithubError("Ce thème n'est pas relié à GitHub.");
  const head = await branchHead(c);
  if (!head) return { applied: [], sha: null };
  const files = await readFiles(c, head);
  const { data, error } = storeUpdateFromFiles(theme, files);
  if (error) throw new GithubError(error);
  await saveThemeRow(store, theme.id, data);
  await db.storeTheme.update({ where: { id: theme.id }, data: { githubLastSha: head, githubSyncedAt: new Date(), githubError: "" } });
  return { applied: Object.keys(files), sha: head };
}

const publicUrl = () => { const u = new URL(appUrl()); return u.protocol === "https:" && !["localhost", "127.0.0.1"].includes(u.hostname); };

/**
 * « Se connecter depuis GitHub » : crée un brouillon de thème relié à la branche. Comme sur Shopify, le thème
 * est nommé « dépôt/branche » ; si la branche contient déjà un thème il est lu, sinon le thème publié y est envoyé.
 */
export async function connectRepo(store: Store, input: { repo: string; branch: string; path: string; token?: string }): Promise<StoreTheme> {
  const viaApp = !input.token;
  if (viaApp && !store.githubInstallationId) throw new GithubError("Connectez d'abord votre compte GitHub.");
  const token = input.token ?? (await installationToken(store.githubInstallationId!));
  const repo = await gh<{ full_name: string; permissions?: { push?: boolean } }>(token, `/repos/${input.repo}`);
  if (!viaApp && repo.permissions && !repo.permissions.push) throw new GithubError("Ce jeton peut lire le dépôt mais pas y écrire (permission « Contents : Read and write » nécessaire).");
  const secret = viaApp ? null : randomBytes(24).toString("hex");
  const name = await uniqueThemeName(store.id, `${repo.full_name.split("/")[1]}/${input.branch}`);
  const draft = await createTheme(store.id, { name, theme: store.theme, customCss: store.customCss, translations: store.translations, source: "github", githubRepo: repo.full_name, githubBranch: input.branch, githubPath: input.path, githubToken: viaApp ? null : encryptToken(token), githubWebhookSecret: secret });
  const c = (await conn(draft, store))!;
  const head = await branchHead(c);
  const existing = head ? await readFiles(c, head) : {};
  if (existing[THEME_FILES.theme] !== undefined) await pullTheme(draft, store);
  else {
    const r = await pushTheme(draft, store, "Thème Revolution Ecom");
    await db.storeTheme.update({ where: { id: draft.id }, data: { githubLastSha: r.sha, githubSyncedAt: new Date() } });
  }
  // Jeton collé : webhook « push » sur le dépôt (l'application GitHub a le sien). Impossible en local.
  if (!viaApp && publicUrl()) {
    try {
      const hook = await gh<{ id: number }>(token, `/repos/${repo.full_name}/hooks`, { method: "POST", body: { name: "web", active: true, events: ["push"], config: { url: `${appUrl()}/api/github/webhook`, content_type: "json", secret } } });
      await db.storeTheme.update({ where: { id: draft.id }, data: { githubWebhookId: hook.id } });
    } catch {
      await db.storeTheme.update({ where: { id: draft.id }, data: { githubError: "Synchronisation automatique impossible : donnez au jeton la permission « Webhooks : Read and write », ou utilisez « Mettre à jour »." } });
    }
  }
  return (await db.storeTheme.findUniqueOrThrow({ where: { id: draft.id } }));
}

/** Déconnecte un thème de son dépôt (le thème est conservé). */
export async function disconnectRepo(theme: StoreTheme, store: Pick<Store, "githubInstallationId">) {
  if (theme.githubToken && theme.githubWebhookId) {
    const c = await conn(theme, store).catch(() => null);
    if (c) await gh(c.token, `/repos/${c.repo}/hooks/${theme.githubWebhookId}`, { method: "DELETE" }).catch(() => null);
  }
  await db.storeTheme.update({ where: { id: theme.id }, data: { githubRepo: null, githubToken: null, githubWebhookId: null, githubWebhookSecret: null, githubLastSha: null, githubSyncedAt: null, githubError: "" } });
}

/** Après une modification dans l'admin : commit sur GitHub, sans faire attendre le marchand. */
export async function pushThemeLater(themeId: string | null | undefined, message: string) {
  if (!themeId) return;
  const run = async () => {
    const theme = await db.storeTheme.findUnique({ where: { id: themeId }, include: { store: true } });
    if (!theme?.githubRepo) return;
    try {
      const r = await pushTheme(theme, theme.store, message);
      await db.storeTheme.update({ where: { id: themeId }, data: { githubLastSha: r.sha, githubSyncedAt: new Date(), githubError: "" } });
    } catch (e) {
      await db.storeTheme.update({ where: { id: themeId }, data: { githubError: `Envoi vers GitHub impossible : ${(e as Error).message}` } });
    }
  };
  try { after(run); } catch { await run(); }
}

/** Signature d'un webhook GitHub (en-tête X-Hub-Signature-256). */
export function validWebhookSignature(secret: string, body: string, header: string | null) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`);
  const got = Buffer.from(header);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
