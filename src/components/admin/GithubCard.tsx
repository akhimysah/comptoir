import { connectGithub, disconnectGithub, pullGithubNow, pushGithubNow } from "@/app/admin/theme/github-actions";
import { ConfirmSubmit } from "./ConfirmSubmit";
import { Pill } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

type Props = { repo: string | null; branch: string; path: string; lastSha: string | null; syncedAt: Date | null; error: string; webhook: boolean; ok?: string; err?: string };

/** Thème relié à un dépôt GitHub : comme l'intégration GitHub de Shopify. */
export function GithubCard({ repo, branch, path, lastSha, syncedAt, error, webhook, ok, err }: Props) {
  return (
    <section id="github" className="card mt-4 flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
        <h2 className="flex-1 text-sm font-[650]">GitHub</h2>
        {repo && <Pill tone={error ? "warn" : "ok"}>{error ? "À vérifier" : "Relié"}</Pill>}
      </div>
      {ok && <p role="status" className="rounded-lg bg-[#ecfdf3] px-3 py-2 text-[13px] text-[#0c5132]">{ok}</p>}
      {err && <p role="alert" className="rounded-lg bg-[#fff4f4] px-3 py-2 text-[13px] text-[#8e0b21]">{err}</p>}
      {repo ? (
        <>
          <p className="text-[13px]">
            Dépôt <a href={`https://github.com/${repo}/tree/${branch}${path ? `/${path}` : ""}`} target="_blank" rel="noopener noreferrer" className="font-mono text-pine hover:underline">{repo}</a>, branche <span className="font-mono">{branch}</span>{path && <> , dossier <span className="font-mono">{path}</span></>}.
            {syncedAt && <span className="text-muted"> Dernière synchronisation le {formatDateTime(syncedAt)}{lastSha ? ` (${lastSha.slice(0, 7)})` : ""}.</span>}
          </p>
          <p className="text-xs text-muted">Chaque modification du thème, du CSS ou des traductions est enregistrée en commit sur la branche. {webhook ? "Un push sur la branche met la boutique à jour automatiquement." : "Après un push sur GitHub, cliquez sur « Récupérer depuis GitHub »."} Fichiers : theme.json, custom.css, locales/en.json.</p>
          {error && <p className="text-xs text-[#8e0b21]">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <form action={pullGithubNow}><button className="btn">Récupérer depuis GitHub</button></form>
            <form action={pushGithubNow}><button className="btn">Envoyer vers GitHub</button></form>
            <form action={disconnectGithub} className="ml-auto"><ConfirmSubmit label="Délier" confirmLabel="Délier le dépôt" /></form>
          </div>
        </>
      ) : (
        <form action={connectGithub} className="flex flex-col gap-3">
          <p className="text-[13px] text-muted">Gardez votre thème dans un dépôt GitHub pour travailler à plusieurs, garder l'historique de chaque changement et revenir en arrière. Si la branche contient déjà un thème, il est importé ; sinon celui de la boutique y est envoyé.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="label sm:col-span-2">Dépôt<input name="repo" required placeholder="propriétaire/dépôt" className="input font-mono" /></label>
            <label className="label">Branche<input name="branch" defaultValue="main" className="input font-mono" /></label>
          </div>
          <label className="label">Dossier du thème <span className="hint">Facultatif, ex. themes/argile</span><input name="path" className="input font-mono" /></label>
          <label className="label">Jeton d'accès GitHub
            <span className="hint">GitHub → Settings → Developer settings → Fine-grained tokens : accès à ce seul dépôt, permissions « Contents : Read and write » et « Webhooks : Read and write ». Il est chiffré et n'est plus jamais affiché.</span>
            <input name="token" type="password" required autoComplete="off" placeholder="github_pat_…" className="input font-mono" />
          </label>
          <button className="btn btn-primary self-end">Relier le dépôt</button>
        </form>
      )}
    </section>
  );
}
