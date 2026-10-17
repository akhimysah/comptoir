"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { BRANCH_RE, connectRepo, disconnectRepo, GithubError, PATH_RE, pullTheme, pushTheme, REPO_RE } from "@/lib/github";
import { installationRepos } from "@/lib/github-app";

const back = (kind: "ok" | "err", msg: string) => redirect(`/admin/theme?gh${kind === "ok" ? "ok" : "err"}=${encodeURIComponent(msg)}#github`);
const message = (e: unknown) => (e instanceof GithubError ? e.message : e instanceof Error && e.message ? e.message : "Erreur inattendue avec GitHub.");

/** Connexion en un clic : dépôt choisi parmi ceux que le marchand a donnés à l'application GitHub. */
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
  let result: { imported: boolean; webhook: boolean };
  try { result = await connectRepo(store, { repo: chosen!.name, branch, path, installationId: store.githubInstallationId! }); } catch (e) {
    await db.store.update({ where: { id: store.id }, data: { githubRepo: null } });
    back("err", message(e));
  }
  await logActivity(`Thème relié à GitHub (${chosen!.name}, branche ${branch})`, "/admin/theme");
  revalidatePath(`/s/${store.slug}`, "layout");
  back("ok", `${result!.imported ? "Thème importé depuis la branche." : "Thème envoyé sur la branche."}${result!.webhook ? " Les prochains push mettront la boutique à jour automatiquement." : ""}`);
}

/** Déconnecte le compte GitHub (l'application reste installée sur GitHub tant que le marchand ne la retire pas). */
export async function disconnectGithubAccount() {
  const { store } = await requireOwner();
  await disconnectRepo(store);
  await logActivity("Compte GitHub déconnecté", "/admin/theme");
  back("ok", "Compte GitHub déconnecté. Vous pouvez aussi retirer l'application dans vos réglages GitHub (Applications installées).");
}

export async function connectGithub(form: FormData) {
  const { store } = await requireOwner();
  const repo = String(form.get("repo") ?? "").trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  const branch = String(form.get("branch") ?? "").trim() || "main";
  const path = String(form.get("path") ?? "").trim().replace(/^\/|\/$/g, "");
  const token = String(form.get("token") ?? "").trim();
  if (!REPO_RE.test(repo)) back("err", "Dépôt invalide : indiquez « propriétaire/dépôt » (ex. atelier-argile/theme).");
  if (!BRANCH_RE.test(branch)) back("err", "Nom de branche invalide.");
  if (!PATH_RE.test(path)) back("err", "Dossier invalide.");
  if (!token) back("err", "Collez un jeton d'accès GitHub.");
  let result: { imported: boolean; webhook: boolean };
  try { result = await connectRepo(store, { repo, branch, path, token }); } catch (e) {
    await db.store.update({ where: { id: store.id }, data: { githubRepo: null, githubToken: null, githubWebhookSecret: null } });
    back("err", message(e));
  }
  await logActivity(`Thème relié à GitHub (${repo}, branche ${branch})`, "/admin/theme");
  revalidatePath(`/s/${store.slug}`, "layout");
  back("ok", `${result!.imported ? "Thème importé depuis la branche." : "Thème envoyé sur la branche."}${result!.webhook ? " Les prochains push mettront la boutique à jour automatiquement." : ""}`);
}

export async function pushGithubNow() {
  const { store } = await requireOwner();
  let changed = false;
  try {
    const r = await pushTheme(store, "Thème envoyé depuis l'admin Parnassa Pay");
    changed = r.changed;
    await db.store.update({ where: { id: store.id }, data: { githubLastSha: r.sha, githubSyncedAt: new Date(), githubError: "" } });
  } catch (e) { back("err", message(e)); }
  back("ok", changed ? "Thème envoyé sur GitHub." : "GitHub est déjà à jour.");
}

export async function pullGithubNow() {
  const { store } = await requireOwner();
  try { await pullTheme(store); } catch (e) { back("err", message(e)); }
  await logActivity("Thème récupéré depuis GitHub", "/admin/theme");
  revalidatePath(`/s/${store.slug}`, "layout");
  back("ok", "Thème récupéré depuis GitHub et publié.");
}

export async function disconnectGithub() {
  const { store } = await requireOwner();
  await disconnectRepo(store, true);
  await logActivity("Thème délié de GitHub", "/admin/theme");
  back("ok", "Dépôt délié. Le thème de la boutique ne change pas.");
}
