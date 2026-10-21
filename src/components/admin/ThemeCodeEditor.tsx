"use client";

import { useEffect, useState, useTransition } from "react";
import { saveThemeFile } from "@/app/admin/theme/actions";
import { cx } from "@/lib/utils";

type Files = Record<string, string>;
const HELP: Record<string, string> = {
  "theme.json": "Couleurs, polices, arrondis, bandeau d'annonce et sections de la page d'accueil (JSON).",
  "custom.css": "CSS ajouté à toutes les pages. Le HTML, les scripts et @import sont retirés à l'enregistrement.",
  "locales/en.json": "Textes anglais : { \"clé\": \"texte\" } (slogan, bandeau, sections « s.<id>.<champ> », menus « menu.<libellé> »).",
};

/** Éditeur de code du thème : liste des fichiers à gauche, contenu à droite, comme sur Shopify. */
export function ThemeCodeEditor({ themeId, initial, paths }: { themeId: string; initial: Files; paths?: string[] }) {
  const [files, setFiles] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [open, setOpenRaw] = useState(Object.keys(initial)[0] ?? paths?.find((p) => p === "layout/theme.liquid") ?? paths?.[0] ?? "");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const all = paths ?? Object.keys(initial);
  // Thème Shopify : le contenu d'un fichier est chargé à l'ouverture (des centaines de fichiers).
  const setOpen = (f: string) => {
    setOpenRaw(f);
    if (files[f] !== undefined) return;
    setLoading(true);
    fetch(`/admin/theme/${themeId}/code/file?path=${encodeURIComponent(f)}`).then((r) => r.text()).then((txt) => { setFiles((x) => ({ ...x, [f]: txt })); setSaved((x) => ({ ...x, [f]: txt })); }).finally(() => setLoading(false));
  };
  useEffect(() => { if (open && files[open] === undefined) setOpen(open); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const folders = [...new Set(all.map((p) => (p.includes("/") ? p.split("/")[0] : "")))];
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = files[open] !== saved[open];
  const save = () => start(async () => {
    setError(null);
    const r = await saveThemeFile(themeId, open, files[open]);
    if (r.error) setError(r.error);
    else setSaved((s) => ({ ...s, [open]: files[open] }));
  });
  return (
    <div className="card grid min-h-[70vh] overflow-hidden md:grid-cols-[240px_1fr]">
      <aside className="border-b border-line md:border-b-0 md:border-r">
        <div className="px-3 py-2 text-xs font-[650] uppercase tracking-wide text-muted">Fichiers</div>
        {all.length > 12 && <div className="px-3 pb-2"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un fichier" className="input h-8 text-[13px]" aria-label="Rechercher un fichier" /></div>}
        <div className="max-h-[70vh] overflow-y-auto">
          {folders.map((dir) => {
            const inDir = all.filter((p) => (dir ? p.startsWith(`${dir}/`) : !p.includes("/")) && (!query || p.toLowerCase().includes(query.toLowerCase())));
            if (!inDir.length) return null;
            const list = (
              <ul>
                {inDir.map((f) => (
                  <li key={f}>
                    <button type="button" onClick={() => { if (dirty && !confirm("Modifications non enregistrées : changer de fichier ?")) return; setOpen(f); setError(null); }} className={cx("flex w-full items-center justify-between px-3 py-1.5 text-left font-mono text-[12.5px] hover:bg-[#f7f7f7]", open === f && "bg-[#f1f1f1] font-[650]")}>
                      <span className="truncate">{dir ? f.slice(dir.length + 1) : f}</span>{files[f] !== undefined && files[f] !== saved[f] && <span className="h-2 w-2 shrink-0 rounded-full bg-[#7c3aed]" title="Non enregistré" />}
                    </button>
                  </li>
                ))}
              </ul>
            );
            return dir ? <details key={dir} open={open.startsWith(`${dir}/`) || Boolean(query)}><summary className="cursor-pointer px-3 py-1.5 text-[13px] font-[650]">{dir}/ <span className="font-normal text-muted">({inDir.length})</span></summary>{list}</details> : <div key="root">{list}</div>;
          })}
        </div>
      </aside>
      <section className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
          <span className="font-mono text-[13px] font-[650]">{open}</span>
          <span className="flex items-center gap-3">
            {error ? <span role="alert" className="text-[13px] text-[#8e0b21]">{error}</span> : <span className="text-xs text-muted">{dirty ? "Modifications non enregistrées" : "Tout est enregistré"}</span>}
            {dirty && <button type="button" className="btn btn-sm" onClick={() => setFiles((x) => ({ ...x, [open]: saved[open] }))}>Annuler</button>}
            <button type="button" className="btn btn-primary btn-sm" disabled={!dirty || pending} onClick={save}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
          </span>
        </div>
        {HELP[open] && <p className="border-b border-line bg-[#fafafa] px-4 py-1.5 text-xs text-muted">{HELP[open]}</p>}
        <textarea value={loading ? "Chargement…" : files[open] ?? ""} readOnly={loading || files[open] === undefined} onChange={(e) => setFiles((x) => ({ ...x, [open]: e.target.value }))} spellCheck={false} aria-label={`Contenu de ${open}`} className="min-h-[60vh] flex-1 resize-none bg-white p-4 font-mono text-[12.5px] leading-relaxed outline-none" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); if (dirty) save(); } }} />
      </section>
    </div>
  );
}
