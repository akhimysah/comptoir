"use client";

import { useEffect, useRef, useState } from "react";

type Media = { id: string; url: string; name: string; alt: string; width: number; height: number; size: number };

/** Fenêtre « Bibliothèque » : choisir une image déjà envoyée (Contenu › Fichiers), avec recherche. */
export function MediaPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (url: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [files, setFiles] = useState<Media[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      fetch(`/admin/media?q=${encodeURIComponent(q)}`).then((r) => r.json()).then((j: { files: Media[] }) => setFiles(j.files)).catch(() => setError("Bibliothèque indisponible."));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [open, q]);
  const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);
  return (
    <dialog ref={ref} onClose={onClose} className="w-[min(56rem,calc(100vw-2rem))] rounded-2xl border border-line p-0 shadow-[0_24px_64px_-24px_rgba(0,0,0,.45)] backdrop:bg-black/40">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="text-[15px] font-[650]">Bibliothèque de fichiers</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher" className="input h-8 w-56 text-[13px]" aria-label="Rechercher une image" />
        <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1 text-muted hover:bg-[#f1f1f1]">✕</button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-4">
        {error && <p role="alert" className="text-[13px] text-[#8e0b21]">{error}</p>}
        {files && !files.length && <p className="py-10 text-center text-[13px] text-muted">{q ? "Aucune image ne correspond." : "Aucune image dans la bibliothèque pour le moment : envoyez-en une avec « Envoyer un fichier »."}</p>}
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {(files ?? []).map((f) => (
            <button key={f.id} type="button" onClick={() => { onPick(f.url); onClose(); }} className="group flex flex-col gap-1 rounded-xl border border-line p-1.5 text-left hover:border-[#7c3aed]" title={f.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.alt} loading="lazy" className="aspect-square w-full rounded-lg bg-[#f1f1f1] object-cover" />
              <span className="truncate text-[11px] font-[550]">{f.name}</span>
              <span className="text-[10px] text-muted">{f.width ? `${f.width} × ${f.height} · ` : ""}{kb(f.size)}</span>
            </button>
          ))}
        </div>
      </div>
    </dialog>
  );
}
