"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { BRANCH_RE, connectRepo, disconnectRepo, GithubError, PATH_RE, pullTheme, pushTheme, REPO_RE } from "@/lib/github";
import { installationRepos, repoBranches } from "@/lib/github-app";
import { ownTheme } from "@/lib/themes";

const back = (kind: "ok" | "err", msg: string) => redirect(`/admin/theme?${kind}=${encodeURIComponent(msg)}`);
const message = (e: unknown) => (e instanceof GithubError ? e.message : e instanceof Error && e.message ? e.message : "Erreur inattendue avec GitHub.");
const refresh = (slug: string) => { revalidatePath("/admin/theme"); revalidatePath(`/s/${slug}`, "layout"); };

/** Branches d'un dépôt accessible par l'installation (pour la fenêtre « Connecter le thème »). */
export async function listBranches(repo: string): Promise<{ branches?: string[]; error?: string }> {
  const { store } = await requireOwner();
  if (!store.githubInstallationId || !REPO_RE.test(repo)) return { error: "Dépôt invalide." };
  try { return { branches: await repoBranches(store.githubInstallationId, repo) }; } catch (e) { return { error: message(e) }; }
}

/** Connexion par l'application GitHub : crée un brouillon relié au dépôt choisi dans la liste. */
export async function connectGithubApp(form: FormData) {
  const { store } = await requireOwner();
  if (!store.githubInstallationId) back("err", "Connectez d'abord votre compte GitHub.");
  const repo = String(form.get("repo") ?? "");
  const path = String(form.get("path") ?? "").trim().replace(/^\/|\/$/g, "");
  if (!PATH_RE.test(path)) back("err", "Dossier invalide.");
  let repos: Awaited<ReturnType<typeof installationRepos>> = [];
  try { repos = await installationRepos(store.githubInstallationId!); } catch (e) { back("err", message(e)); }
  const chosen = repos.find((r) => r.name === repo);
  if (!chosen) back("err", "Choisissez un dépôt de la liste (ceux auxquels vous avez donné accès sur GitHub).");
  const branch = String(form.get("branch") ?? "").trim() || chosen!.defaultBranch;
  if (!BRANCH_RE.test(branch)) back("err", "Nom de branche invalide.");
  let row;
  try { row = await connectRepo(store, { repo: chosen!.name, branch, path }); } catch (e) { back("err", message(e)); }
  await logActivity(`Thème relié à GitHub (${row!.githubRepo}, branche ${branch})`, `/admin/theme/${row!.id}`);
  refresh(store.slug);
  back("ok", `« ${row!.name} » ajouté à vos brouillons, relié à GitHub.`);
}

/** Connexion par jeton collé (sans application GitHub). */
export async function connectGithubToken(form: FormData) {
  const { store } = await requireOwner();
  const repo = String(form.get("repo") ?? "").trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  const branch = String(form.get("branch") ?? "").trim() || "main";
  const path = String(form.get("path") ?? "").trim().replace(/^\/|\/$/g, "");
  const token = String(form.get("token") ?? "").trim();
  if (!REPO_RE.test(repo)) back("err", "Dépôt invalide : indiquez « propriétaire/dépôt ».");
  if (!BRANCH_RE.test(branch)) back("err", "Nom de branche invalide.");
  if (!PATH_RE.test(path)) back("err", "Dossier invalide.");
  if (!token) back("err", "Collez un jeton d'accès GitHub.");
  let row;
  try { row = await connectRepo(store, { repo, branch, path, token }); } catch (e) { back("err", message(e)); }
  await logActivity(`Thème relié à GitHub (${repo}, branche ${branch})`, `/admin/theme/${row!.id}`);
  refresh(store.slug);
  back("ok", `« ${row!.name} » ajouté à vos brouillons, relié à GitHub.`);
}

/** « Mettre à jour » : récupère les derniers commits de la branche. */
export async function updateFromGithub(form: FormData) {
  const { store } = await requireOwner();
  const theme = await ownTheme(store.id, String(form.get("id") ?? ""));
  if (!theme?.githubRepo) back("err", "Ce thème n'est pas relié à GitHub.");
  try { await pullTheme(theme!, store); } catch (e) { back("err", message(e)); }
  await logActivity(`Thème « ${theme!.name} » mis à jour depuis GitHub`, `/admin/theme/${theme!.id}`);
  refresh(store.slug);
  back("ok", `« ${theme!.name} » mis à jour depuis GitHub.`);
}

export async function pushToGithub(form: FormData) {
  const { store } = await requireOwner();
  const theme = await ownTheme(store.id, String(form.get("id") ?? ""));
  if (!theme?.githubRepo) back("err", "Ce thème n'est pas relié à GitHub.");
  let changed = false;
  try {
    const r = await pushTheme(theme!, store, "Thème envoyé depuis l'admin Revolution Ecom");
    changed = r.changed;
    await db.storeTheme.update({ where: { id: theme!.id }, data: { githubLastSha: r.sha, githubSyncedAt: new Date(), githubError: "" } });
  } catch (e) { back("err", message(e)); }
  revalidatePath("/admin/theme");
  back("ok", changed ? "Thème envoyé sur GitHub." : "GitHub est déjà à jour.");
}

export async function disconnectGithub(form: FormData) {
  const { store } = await requireOwner();
  const theme = await ownTheme(store.id, String(form.get("id") ?? ""));
  if (!theme) back("err", "Thème introuvable.");
  await disconnectRepo(theme!, store);
  await logActivity(`Thème « ${theme!.name} » déconnecté de GitHub`, "/admin/theme");
  revalidatePath("/admin/theme");
  back("ok", "Thème déconnecté de GitHub (il est conservé).");
}

/** Déconnecte le compte GitHub de la boutique (les thèmes reliés gardent leur dépôt mais ne se synchronisent plus). */
export async function disconnectGithubAccount() {
  const { store } = await requireOwner();
  await db.store.update({ where: { id: store.id }, data: { githubInstallationId: null } });
  await logActivity("Compte GitHub déconnecté", "/admin/theme");
  back("ok", "Compte GitHub déconnecté. Vous pouvez aussi retirer l'application dans vos réglages GitHub (Applications installées).");
}
