import Link from "next/link";
import { newTheme, publish } from "./actions";
import { updateFromGithub } from "./github-actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { PresetGallery } from "@/components/admin/PresetGallery";
import { ThemeImportMenu, GithubIcon } from "@/components/admin/ThemeImportMenu";
import { ThemeMenu } from "@/components/admin/ThemeMenu";
import { ThemeThumb } from "@/components/admin/ThemeThumb";
import { VitalsBar } from "@/components/admin/VitalsBar";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { storeBase } from "@/lib/domains";
import { isBehind } from "@/lib/github";
import { appConfig, installationAccount, installationRepos } from "@/lib/github-app";
import { storeThemes } from "@/lib/themes";
import { formatDate, formatDateTime } from "@/lib/utils";
import { storeVitals } from "@/lib/vitals";

export const metadata = { title: "Thèmes" };

const Badge = ({ repo, branch }: { repo: string; branch: string }) => (
  <a href={`https://github.com/${repo}/tree/${branch}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-[#ebebeb] px-2 py-1 text-xs font-[550] hover:bg-[#e3e3e3]"><GithubIcon className="h-3.5 w-3.5" />{repo.split("/")[1]}/{branch}</a>
);

export default async function ThemesPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { ok, err } = await searchParams;
  const { store, isOwner } = await requirePerm("content");
  const { themes, publishedId } = await storeThemes(store);
  const current = themes.find((t) => t.id === publishedId)!;
  const drafts = themes.filter((t) => t.id !== publishedId);
  const [vitals, app] = await Promise.all([storeVitals(store.id), appConfig()]);
  // Connexion GitHub : compte et dépôts accessibles (pour la fenêtre « Connecter le thème »).
  let account: string | null = null, repos: Awaited<ReturnType<typeof installationRepos>> | null = null, reposError: string | null = null;
  if (app && store.githubInstallationId && isOwner) {
    try { [account, repos] = await Promise.all([installationAccount(store.githubInstallationId), installationRepos(store.githubInstallationId)]); } catch (e) { reposError = (e as Error).message; account = account ?? "GitHub"; }
  }
  // Thèmes reliés : y a-t-il des commits à récupérer ? (bouton « Mettre à jour »)
  const behind = new Map(await Promise.all(themes.filter((t) => t.githubRepo).map(async (t) => [t.id, await isBehind(t, store).catch(() => false)] as const)));
  const base = storeBase(store);

  return (
    <>
      <PageHeader title="Thèmes" subtitle="Le thème publié est celui que voient vos clients. Les brouillons se modifient et se prévisualisent sans rien changer à la boutique." actions={<><ThemeImportMenu github={{ app: Boolean(app), appSlug: app?.slug ?? null, account, repos, reposError }} /><form action={newTheme}><button className="btn btn-primary">+ Nouveau</button></form></>} />
      {ok && <p role="status" className="rounded-lg border border-[#b4fed2] bg-[#ecfdf3] px-4 py-3 text-[#0c5132]">{ok}</p>}
      {err && <p role="alert" className="rounded-lg border border-[#fedad9] bg-[#fff4f4] px-4 py-3 text-[#8e0b21]">{err}</p>}

      <VitalsBar v={vitals} />

      {/* Thème actuel : aperçu vivant de la boutique */}
      <section className="card">
        <div className="relative overflow-hidden rounded-[inherit]">
          <ThemeThumb src={base} width={1000} height={560} className="w-full !max-w-full" />
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,.72))] px-5 pb-4 pt-16 text-white">
            <div className="min-w-0">
              <div className="truncate text-lg font-[650]">{new URL(base).host}</div>
              <div className="text-[13px] text-white/80">{current.name} · Dernier enregistrement : {formatDateTime(current.updatedAt)}</div>
              {current.githubRepo && <div className="mt-2"><a href={`https://github.com/${current.githubRepo}/tree/${current.githubBranch}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-2 py-1 text-xs font-[550] backdrop-blur hover:bg-white/25"><GithubIcon className="h-3.5 w-3.5" />{current.githubRepo.split("/")[1]}/{current.githubBranch}</a></div>}
              {current.githubError && <div className="mt-1 text-xs text-[#ffb4a8]">{current.githubError}</div>}
            </div>
            <div className="flex items-center gap-2">
              {behind.get(current.id) && isOwner && <form action={updateFromGithub}><input type="hidden" name="id" value={current.id} /><button className="btn h-9 border-0 bg-[#cce3ff] text-[#0a3a7a] hover:bg-[#b9d7ff]">Mettre à jour</button></form>}
              <Link href={`/admin/theme/${current.id}`} className="btn h-9 border-0 bg-white text-ink hover:bg-[#f1f1f1]">Modifier le thème</Link>
              <div className="[&_summary]:bg-white [&_summary]:text-ink"><ThemeMenu theme={current} slug={store.slug} published owner={isOwner} dropUp /></div>
            </div>
          </div>
        </div>
      </section>

      {/* Brouillons */}
      <section className="card">
        <div className="card-h flex-wrap gap-2"><h2 className="text-base font-[650]">Brouillons de thèmes</h2><span className="text-xs text-muted">{drafts.length ? `${drafts.length} brouillon${drafts.length > 1 ? "s" : ""}` : "Aucun brouillon"}</span></div>
        {drafts.length ? (
          <ul>
            {drafts.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-4 border-b border-line px-4 py-4 last:border-0">
                <ThemeThumb src={`${base}?pt=${t.id}`} width={128} height={80} className="shrink-0 rounded-lg border border-line" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-[650]">{t.name}</div>
                  <div className="text-[13px] text-muted">{t.source === "editor" || t.source === "copy" ? `Dernière sauvegarde : ${formatDateTime(t.updatedAt)}` : `Ajouté le : ${formatDateTime(t.createdAt)}`}</div>
                  {t.githubRepo && <div className="mt-1.5"><Badge repo={t.githubRepo} branch={t.githubBranch} /></div>}
                  {t.githubError && <div className="mt-1 text-xs text-[#8e0b21]">{t.githubError}</div>}
                </div>
                <div className="flex items-center gap-2">
                  {behind.get(t.id) && isOwner && <form action={updateFromGithub}><input type="hidden" name="id" value={t.id} /><button className="btn h-8 border-0 bg-[#cce3ff] text-[#0a3a7a] hover:bg-[#b9d7ff]">Mettre à jour</button></form>}
                  <form action={publish}><input type="hidden" name="id" value={t.id} /><ConfirmSubmit label="Publier" confirmLabel={`Publier « ${t.name} »`} className="h-8" /></form>
                  <Link href={`/admin/theme/${t.id}`} className="btn h-8">Modifier le thème</Link>
                  <ThemeMenu theme={t} slug={store.slug} published={false} owner={isOwner} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-[13px] text-muted">Ajoutez un modèle de la galerie ci-dessous, importez un .zip, connectez un dépôt GitHub ou créez un thème vierge avec « + Nouveau ».</p>
        )}
      </section>

      <PresetGallery />
      <p className="text-xs text-muted">Thèmes créés le {formatDate(current.createdAt)} ou après : chaque enregistrement dans l'éditeur du thème publié met la boutique à jour immédiatement ; un brouillon ne change rien tant qu'il n'est pas publié.</p>
    </>
  );
}
