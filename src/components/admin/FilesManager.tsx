"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeFile, saveFileAlt } from "@/app/admin/content/files/actions";
import { uploadImage } from "./upload";

export type FileRow = { id: string; url: string; name: string; alt: string; mime: string; size: number; createdAt: string; products: number; theme: boolean };

const size = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1).replace(".", ",")} Mo` : n >= 1024 ? `${Math.round(n / 1024)} Ko` : n ? `${n} o` : "—");
const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** Bibliothèque de fichiers : recherche, envoi, texte alternatif modifiable, suppression, références. */
export function FilesManager({ files, query }: { files: FileRow[]; query: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [, start] = useTransition();

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of Array.from(list)) await uploadImage(f);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const act = (fn: () => Promise<{ error?: string; ok?: boolean }>) => start(async () => { const r = await fn(); if (r.error) setError(r.error); else router.refresh(); });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <form method="get" className="flex flex-1 gap-2">
          <input name="q" defaultValue={query} placeholder="Rechercher un fichier par nom…" aria-label="Rechercher" className="input max-w-sm" />
          <button className="btn">Rechercher</button>
          {query && <a href="/admin/content/files" className="btn">Effacer</a>}
        </form>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Envoi…" : "Envoyer des fichiers"}</button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
      <p className="text-xs text-muted">JPG, PNG, WebP ou GIF, 5 Mo maximum par fichier.</p>
      {error && <p role="alert" className="text-[13px] text-[#8e0b21]">{error}</p>}
      {files.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-left text-xs text-muted"><tr className="border-b border-line"><th className="px-4 py-2 font-[550]">Fichier</th><th className="px-4 py-2 font-[550]">Texte alternatif</th><th className="px-4 py-2 font-[550]">Date</th><th className="px-4 py-2 text-right font-[550]">Taille</th><th className="px-4 py-2 font-[550]">Références</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt={f.alt} className="h-12 w-12 shrink-0 rounded-lg border border-line object-cover" />
                      <div className="min-w-0">
                        <div className="truncate font-[550]" title={f.name}>{f.name}</div>
                        <button type="button" className="text-xs text-muted hover:underline" onClick={() => { navigator.clipboard?.writeText(f.url.startsWith("/") ? location.origin + f.url : f.url).catch(() => {}); setCopied(f.id); setTimeout(() => setCopied(null), 1500); }}>{copied === f.id ? "Adresse copiée" : "Copier l'adresse"}</button>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <input defaultValue={f.alt} maxLength={300} placeholder="Décrire l'image…" aria-label={`Texte alternatif de ${f.name}`} className="input min-w-44" onBlur={(e) => { if (e.target.value.trim() !== f.alt) act(() => saveFileAlt(f.id, e.target.value)); }} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-muted">{date(f.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-muted">{size(f.size)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-muted">{[f.products ? `${f.products} produit${f.products > 1 ? "s" : ""}` : "", f.theme ? "thème" : ""].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => { if (confirm(f.products || f.theme ? `« ${f.name} » est encore utilisé. Le supprimer quand même ? Les produits ou le thème qui l'utilisent perdront l'image.` : `Supprimer « ${f.name} » ?`)) act(() => removeFile(f.id)); }}>Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
