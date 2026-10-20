"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateOrderTags } from "@/app/admin/orders/actions";

/**
 * Balises d'une commande (comme Shopify) : champ « Rechercher ou créer des balises », suggestions
 * parmi les balises déjà utilisées dans la boutique, puces cliquables qui filtrent la liste.
 */
export function OrderTags({ orderId, tags: initial, suggestions }: { orderId: string; tags: string[]; suggestions: string[] }) {
  const [tags, setTags] = useState(initial);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const save = (next: string[]) => {
    setTags(next);
    start(async () => {
      const r = await updateOrderTags(orderId, next);
      setTags(r.tags);
      router.refresh();
    });
  };
  const add = (raw: string) => {
    const t = raw.trim().toLowerCase().slice(0, 30);
    setQ("");
    if (!t || tags.includes(t) || tags.length >= 20) return;
    save([...tags, t]);
  };
  const remove = (t: string) => save(tags.filter((x) => x !== t));
  const query = q.trim().toLowerCase();
  const matches = suggestions.filter((s) => !tags.includes(s) && (!query || s.includes(query))).slice(0, 8);
  const canCreate = query.length > 0 && !tags.includes(query) && !suggestions.includes(query);

  return (
    <div className="relative flex flex-col gap-2">
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); add(q); }
          if (e.key === "Backspace" && !q && tags.length) remove(tags[tags.length - 1]);
          if (e.key === "Escape") setOpen(false);
        }}
        className="input h-8"
        placeholder="Rechercher ou créer des balises"
        aria-label="Balises de la commande"
        disabled={pending}
        maxLength={30}
      />
      {open && (matches.length > 0 || canCreate) && (
        <ul role="listbox" className="absolute left-0 right-0 top-9 z-10 max-h-56 overflow-auto rounded-lg border border-line bg-white py-1 shadow-lg">
          {canCreate && <li><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(query)} className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-[#f1f1f1]">Ajouter « {query} »</button></li>}
          {matches.map((s) => <li key={s}><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)} className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-[#f1f1f1]">{s}</button></li>)}
        </ul>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-md bg-[#ebebeb] px-1.5 py-0.5 text-xs font-[550]">
              <Link href={`/admin/orders?tag=${encodeURIComponent(t)}`} className="hover:underline">{t}</Link>
              <button type="button" onClick={() => remove(t)} aria-label={`Retirer la balise ${t}`} className="text-muted hover:text-ink" disabled={pending}>✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
