import { notFound } from "next/navigation";
import { restoreThemeRevision } from "../../actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { PageHeader, Pill } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { listRevisions } from "@/lib/theme-revisions";
import { ownTheme } from "@/lib/themes";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Historique des versions" };

/** Historique des versions d'un thème : chaque enregistrement, avec les fichiers touchés, et un retour en arrière. */
export default async function ThemeHistoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [{ id }, { ok, err }] = await Promise.all([params, searchParams]);
  const { store } = await requirePerm("content");
  const theme = await ownTheme(store.id, id);
  if (!theme) notFound();
  const revisions = await listRevisions(theme.id);
  return (
    <>
      <PageHeader back={`/admin/theme/${theme.id}`} title={`${theme.name} · historique`} subtitle="Chaque enregistrement garde l'état précédent des fichiers modifiés. « Revenir avant » remet le thème tel qu'il était juste avant cette version ; ce retour est lui-même une version, donc annulable." actions={store.publishedThemeId === theme.id ? <Pill tone="ok">Publié</Pill> : <Pill>Brouillon</Pill>} />
      {ok && <p role="status" className="rounded-lg border border-[#b4fed2] bg-[#ecfdf3] px-4 py-3 text-[#0c5132]">{ok}</p>}
      {err && <p role="alert" className="rounded-lg border border-[#fedad9] bg-[#fff4f4] px-4 py-3 text-[#8e0b21]">{err}</p>}
      <section className="card overflow-hidden">
        {revisions.length ? (
          <ul>
            {revisions.map((r, i) => (
              <li key={r.id} className="flex flex-wrap items-center gap-4 border-b border-line px-4 py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="font-[650]">{r.label}{i === 0 && <span className="ml-2 rounded-full bg-[#e3e3e3] px-2 py-0.5 text-[11px] font-[550]">Dernière</span>}</div>
                  <div className="text-[13px] text-muted">{formatDateTime(r.createdAt)}{r.userName ? ` · ${r.userName}` : ""} · {r.entries.length} fichier{r.entries.length > 1 ? "s" : ""} : <span className="font-mono text-xs">{r.entries.map((e) => e.path).slice(0, 4).join(", ")}{r.entries.length > 4 ? "…" : ""}</span></div>
                </div>
                <form action={restoreThemeRevision}><input type="hidden" name="themeId" value={theme.id} /><input type="hidden" name="revisionId" value={r.id} /><ConfirmSubmit label="Revenir avant cette version" confirmLabel={`Revenir à l'état d'avant « ${r.label} » (${formatDateTime(r.createdAt)})`} className="h-8" /></form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-10 text-center text-[13px] text-muted">Aucune version pour le moment : l'historique commence au prochain enregistrement.</p>
        )}
      </section>
    </>
  );
}
