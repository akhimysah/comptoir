"use client";

import { useState, useTransition } from "react";
import { saveThemeFile } from "@/app/admin/theme/actions";
import { cx } from "@/lib/utils";

type Files = Record<string, string>;
const HELP: Record<string, string> = {
  "theme.json": "Couleurs, polices, arrondis, bandeau d'annonce et sections de la page d'accueil (JSON).",
  "custom.css": "CSS ajouté à toutes les pages. Le HTML, les scripts et @import sont retirés à l'enregistrement.",
  "locales/en.json": "Textes anglais : { \"clé\": \"texte\" } (slogan, bandeau, sections « s.<id>.<champ> », menus « menu.<libellé> »).",
};

/** Éditeur de code du thème : liste des fichiers à gauche, contenu à droite, comme sur Shopify. */
export function ThemeCodeEditor({ themeId, initial }: { themeId: string; initial: Files }) {
  const [files, setFiles] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [open, setOpen] = useState(Object.keys(initial)[0]);
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
        <ul>
          {Object.keys(files).map((f) => (
            <li key={f}>
              <button type="button" onClick={() => { if (dirty && !confirm("Modifications non enregistrées : changer de fichier ?")) return; setOpen(f); setError(null); }} className={cx("flex w-full items-center justify-between px-3 py-2 text-left font-mono text-[13px] hover:bg-[#f7f7f7]", open === f && "bg-[#f1f1f1] font-[650]")}>
                <span>{f}</span>{files[f] !== saved[f] && <span className="h-2 w-2 rounded-full bg-[#7c3aed]" title="Non enregistré" />}
              </button>
            </li>
          ))}
        </ul>
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
        <p className="border-b border-line bg-[#fafafa] px-4 py-1.5 text-xs text-muted">{HELP[open]}</p>
        <textarea value={files[open]} onChange={(e) => setFiles((x) => ({ ...x, [open]: e.target.value }))} spellCheck={false} aria-label={`Contenu de ${open}`} className="min-h-[60vh] flex-1 resize-none bg-white p-4 font-mono text-[12.5px] leading-relaxed outline-none" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); if (dirty) save(); } }} />
      </section>
    </div>
  );
}
