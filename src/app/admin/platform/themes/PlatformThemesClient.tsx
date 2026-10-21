"use client";

import { useRef, useState } from "react";
import { ZipDialog } from "@/components/admin/ThemeImportMenu";
import { ImageField } from "@/components/admin/ImageField";
import { deletePlatformTheme, savePlatformTheme } from "./actions";

type T = { id: string; name: string; version: string; author: string; description: string; thumbnail: string | null; files: number; size: number };

/** Bibliothèque de thèmes de la plateforme : dépôt des .zip, fiche (nom, description, capture), suppression. */
export function PlatformThemesClient({ themes }: { themes: T[] }) {
  const zip = useRef<HTMLDialogElement>(null);
  const [updateOf, setUpdateOf] = useState<string | null>(null);
  return (
    <>
      <div className="flex justify-end"><button type="button" className="btn btn-primary" onClick={() => { setUpdateOf(null); zip.current?.showModal(); }}>Déposer un thème (.zip)</button></div>
      <ZipDialog ref={zip} platform updateOf={updateOf} />
      {themes.length ? themes.map((t) => <Card key={t.id} t={t} onUpdate={() => { setUpdateOf(t.id); zip.current?.showModal(); }} />) : <p className="card px-4 py-10 text-center text-[13px] text-muted">Aucun thème pour le moment. Déposez les .zip de vos thèmes Shopify : ils apparaîtront dans « Découvrir des thèmes » de toutes les boutiques.</p>}
    </>
  );
}

function Card({ t, onUpdate }: { t: T; onUpdate: () => void }) {
  const [thumb, setThumb] = useState<string | null>(t.thumbnail);
  return (
    <form action={savePlatformTheme} className="card grid gap-4 p-4 md:grid-cols-[200px_1fr]">
      <input type="hidden" name="id" value={t.id} />
      <input type="hidden" name="thumbnail" value={thumb ?? ""} />
      <div className="flex flex-col gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {thumb ? <img src={thumb} alt="" className="aspect-[4/3] w-full rounded-lg border border-line object-cover" /> : <div className="grid aspect-[4/3] w-full place-items-center rounded-lg border-2 border-dashed border-line text-xs text-muted">Pas de capture</div>}
        <ImageField id={`thumb-${t.id}`} label="Capture d'écran (galerie)" value={thumb} onChange={setThumb} />
      </div>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="label">Nom<input name="name" defaultValue={t.name} maxLength={60} className="input" /></label>
          <div className="label">Version et auteur<div className="input flex items-center bg-[#fafafa] text-muted">{t.version || "—"} · {t.author || "—"}</div></div>
        </div>
        <label className="label">Description (galerie)<input name="description" defaultValue={t.description} maxLength={200} placeholder="Ex. Mode et lifestyle, grandes images, animations." className="input" /></label>
        <div className="text-xs text-muted">{t.files} fichiers · {(t.size / 1048576).toFixed(1)} Mo</div>
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="btn" onClick={onUpdate}>Mettre à jour (.zip)</button>
          <button type="submit" formAction={deletePlatformTheme} onClick={(e) => { if (!confirm(`Supprimer « ${t.name} » de la bibliothèque ? Les boutiques qui l'ont déjà installé le gardent.`)) e.preventDefault(); }} className="btn text-[#8e0b21]">Supprimer de la bibliothèque</button>
          <button className="btn btn-primary">Enregistrer</button>
        </div>
      </div>
    </form>
  );
}
