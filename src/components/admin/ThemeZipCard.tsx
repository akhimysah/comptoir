"use client";

import { useRef, useState } from "react";

/** Import / export du thème en .zip, avec une zone où déposer le fichier (comme « Importer un thème » sur Shopify). */
export function ThemeZipCard({ ok, err }: { ok?: string; err?: string }) {
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const pick = (file: File | undefined) => {
    setProblem(null);
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) return setProblem("Déposez un fichier .zip.");
    if (file.size > 2 * 1024 * 1024) return setProblem("Fichier trop lourd (2 Mo maximum).");
    if (!confirm(`Importer « ${file.name} » ? Le thème actuel de la boutique sera remplacé (téléchargez-le d'abord pour le garder).`)) { if (input.current) input.current.value = ""; return; }
    // Fichier déposé : placé dans le champ du formulaire, puis envoyé.
    if (input.current && input.current.files?.[0] !== file) { const dt = new DataTransfer(); dt.items.add(file); input.current.files = dt.files; }
    setName(file.name);
    form.current?.requestSubmit();
  };

  return (
    <section id="fichiers" className="card mt-4 flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-sm font-[650]">Fichiers du thème</h2>
        <a href="/admin/theme/zip" className="btn">Télécharger le thème (.zip)</a>
      </div>
      {ok && <p role="status" className="rounded-lg bg-[#ecfdf3] px-3 py-2 text-[13px] text-[#0c5132]">{ok}</p>}
      {(err || problem) && <p role="alert" className="rounded-lg bg-[#fff4f4] px-3 py-2 text-[13px] text-[#8e0b21]">{problem ?? err}</p>}
      <form ref={form} action="/admin/theme/zip" method="post" encType="multipart/form-data">
        <label
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
          className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${over ? "border-[#7c3aed] bg-[#f5f3ff]" : "border-line hover:bg-[#f7f7f7]"}`}
        >
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-muted" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
          <span className="text-[13px] font-[550]">{name ? `Import de ${name}…` : "Déposez un thème .zip ici, ou cliquez pour le choisir"}</span>
          <span className="text-xs text-muted">theme.json, custom.css, locales/en.json · 2 Mo maximum</span>
          <input ref={input} type="file" name="zip" accept=".zip,application/zip" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
      </form>
      <p className="text-xs text-muted">Pour modifier le thème hors de l'admin : téléchargez-le, modifiez les fichiers, recompressez le dossier et déposez le .zip. Les thèmes Shopify (.liquid) ne sont pas compatibles.</p>
    </section>
  );
}
