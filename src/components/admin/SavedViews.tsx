"use client";

import { useState } from "react";
import { deleteView, saveView, type ViewPage } from "@/lib/saved-views";
import { cx } from "@/lib/utils";

type View = { id: string; name: string; query: string };

/** Onglets des vues enregistrées + bouton « Enregistrer la vue » quand des filtres sont actifs. */
export function SavedViews({ page, basePath, views, currentQuery, activeId }: { page: ViewPage; basePath: string; views: View[]; currentQuery: string; activeId: string | null }) {
  const [naming, setNaming] = useState(false);
  const hasFilters = currentQuery.length > 0;
  return (
    <>
      {views.map((v) => (
        <span key={v.id} className={cx("group relative inline-flex items-center rounded-lg text-[13px] font-[550]", activeId === v.id ? "bg-[#e3e3e3] text-ink" : "text-muted hover:bg-[#f1f1f1] hover:text-ink")}>
          <a href={`${basePath}?${v.query}&view=${v.id}`} className="px-3 py-1.5">{v.name}</a>
          <form action={deleteView} className="absolute -right-1 -top-1 hidden group-hover:block"><input type="hidden" name="page" value={page} /><input type="hidden" name="id" value={v.id} /><button aria-label={`Supprimer la vue ${v.name}`} className="grid h-4 w-4 place-items-center rounded-full bg-[#303030] text-[10px] text-white">×</button></form>
        </span>
      ))}
      {hasFilters && !activeId && (naming ? (
        <form action={saveView} className="inline-flex items-center gap-1" onSubmit={() => setNaming(false)}>
          <input type="hidden" name="page" value={page} /><input type="hidden" name="query" value={currentQuery} />
          <input name="name" autoFocus required maxLength={40} placeholder="Nom de la vue" aria-label="Nom de la vue" className="input h-7 w-36 py-0 text-[13px]" />
          <button className="btn h-7 py-0 text-[13px]">OK</button>
          <button type="button" onClick={() => setNaming(false)} className="text-xs text-muted hover:underline">Annuler</button>
        </form>
      ) : (
        <button type="button" onClick={() => setNaming(true)} className="rounded-lg px-3 py-1.5 text-[13px] font-[550] text-pine hover:bg-[#f1f1f1]">+ Enregistrer la vue</button>
      ))}
    </>
  );
}
