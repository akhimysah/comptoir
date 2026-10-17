import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { open, seal } from "./secret-box";
import { installationToken } from "./github-app";
import { after } from "next/server";
import type { Store } from "@prisma/client";
import { db } from "./db";
import { appUrl } from "./stripe";
import { storeUpdateFromFiles, THEME_FILES, themeFiles } from "./theme-files";

/**
 * Thème relié à un dépôt GitHub (comme l'intégration GitHub de Shopify) :
 * chaque modification du thème dans l'admin devient un commit sur la branche, et chaque push sur la branche
 * met à jour la boutique (webhook GitHub, ou bouton « Récupérer depuis GitHub »).
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
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ParnassaPay", ...(init.body ? { "Content-Type": "application/json" } : {}) },
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
/** Accès au dépôt : jeton de l'installation de l'application GitHub (connexion en un clic), ou jeton collé. */
async function conn(s: Store): Promise<Conn | null> {
  if (!s.githubRepo) return null;
  if (s.githubInstallationId) return { repo: s.githubRepo, branch: s.githubBranch, path: s.githubPath, token: await installationToken(s.githubInstallationId) };
  return s.githubToken ? { repo: s.githubRepo, branch: s.githubBranch, path: s.githubPath, token: decryptToken(s.githubToken) } : null;
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

/** Envoie le thème de la boutique sur la branche en un seul commit (rien si les fichiers sont identiques). */
export async function pushTheme(store: Store, message: string): Promise<{ sha: string | null; changed: boolean }> {
  const c = await conn(store);
  if (!c) throw new GithubError("Aucun dépôt GitHub relié.");
  const files = themeFiles(store);
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

/** Récupère le thème depuis la branche et l'applique à la boutique (fichiers vérifiés comme dans l'éditeur). */
export async function pullTheme(store: Store): Promise<{ applied: string[]; sha: string | null }> {
  const c = await conn(store);
  if (!c) throw new GithubError("Aucun dépôt GitHub relié.");
  const head = await branchHead(c);
  if (!head) return { applied: [], sha: null };
  const files = await readFiles(c, head);
  const { data, error } = storeUpdateFromFiles(store, files);
  if (error) throw new GithubError(error);
  await db.store.update({ where: { id: store.id }, data: { ...data, ...(data.theme ? { themeUpdatedAt: new Date() } : {}), githubLastSha: head, githubSyncedAt: new Date(), githubError: "" } });
  return { applied: Object.keys(files), sha: head };
}

const publicUrl = () => { const u = new URL(appUrl()); return u.protocol === "https:" && !["localhost", "127.0.0.1"].includes(u.hostname); };

/**
 * Relie la boutique au dépôt. Comme sur Shopify : si la branche contient déjà un thème, il est importé ;
 * sinon le thème actuel de la boutique y est envoyé. Un webhook est ajouté pour la synchronisation automatique.
 */
export async function connectRepo(store: Store, input: { repo: string; branch: string; path: string; token?: string; installationId?: number }): Promise<{ imported: boolean; webhook: boolean }> {
  const viaApp = Boolean(input.installationId);
  const token = viaApp ? await installationToken(input.installationId!) : input.token!;
  const repo = await gh<{ full_name: string; permissions?: { push?: boolean; admin?: boolean } }>(token, `/repos/${input.repo}`);
  if (!viaApp && repo.permissions && !repo.permissions.push) throw new GithubError("Ce jeton peut lire le dépôt mais pas y écrire (permission « Contents : Read and write » nécessaire).");
  const secret = viaApp ? null : randomBytes(24).toString("hex");
  const linked = await db.store.update({
    where: { id: store.id },
    data: { githubRepo: repo.full_name, githubBranch: input.branch, githubPath: input.path, githubToken: viaApp ? null : encryptToken(token), githubInstallationId: input.installationId ?? null, githubWebhookSecret: secret, githubWebhookId: null, githubLastSha: null, githubError: "" },
  });
  const c = (await conn(linked))!;
  const head = await branchHead(c);
  const existing = head ? await readFiles(c, head) : {};
  let imported = false;
  if (existing[THEME_FILES.theme] !== undefined) { await pullTheme(linked); imported = true; }
  else {
    const r = await pushTheme(linked, "Thème Parnassa Pay");
    await db.store.update({ where: { id: store.id }, data: { githubLastSha: r.sha, githubSyncedAt: new Date() } });
  }
  // Application GitHub : son propre webhook reçoit les push de tous les dépôts installés.
  if (viaApp) return { imported, webhook: publicUrl() };
  // Jeton collé : webhook « push » sur le dépôt (impossible en local, GitHub ne peut pas joindre localhost).
  let webhook = false;
  if (publicUrl()) {
    try {
      const hook = await gh<{ id: number }>(token, `/repos/${repo.full_name}/hooks`, { method: "POST", body: { name: "web", active: true, events: ["push"], config: { url: `${appUrl()}/api/github/webhook`, content_type: "json", secret } } });
      await db.store.update({ where: { id: store.id }, data: { githubWebhookId: hook.id } });
      webhook = true;
    } catch {
      await db.store.update({ where: { id: store.id }, data: { githubError: "Synchronisation automatique impossible : donnez au jeton la permission « Webhooks : Read and write », ou utilisez « Récupérer depuis GitHub »." } });
    }
  }
  return { imported, webhook };
}

export async function disconnectRepo(store: Store, keepInstallation = false) {
  const c = store.githubToken ? await conn(store).catch(() => null) : null;
  if (c && store.githubWebhookId) await gh(c.token, `/repos/${c.repo}/hooks/${store.githubWebhookId}`, { method: "DELETE" }).catch(() => null);
  await db.store.update({ where: { id: store.id }, data: { githubRepo: null, githubToken: null, githubWebhookId: null, githubWebhookSecret: null, githubLastSha: null, githubSyncedAt: null, githubError: "", ...(keepInstallation ? {} : { githubInstallationId: null }) } });
}

/** Après une modification du thème dans l'admin : commit sur GitHub, sans faire attendre le marchand. */
export async function pushThemeLater(storeId: string, message: string) {
  const run = async () => {
    const store = await db.store.findUnique({ where: { id: storeId } });
    if (!store?.githubRepo) return;
    try {
      const r = await pushTheme(store, message);
      await db.store.update({ where: { id: storeId }, data: { githubLastSha: r.sha, githubSyncedAt: new Date(), githubError: "" } });
    } catch (e) {
      await db.store.update({ where: { id: storeId }, data: { githubError: `Envoi vers GitHub impossible : ${(e as Error).message}` } });
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
