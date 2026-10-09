"use client";

import { useState, useTransition } from "react";
import { saveMenu } from "@/app/admin/navigation/actions";
import type { LinkType, MenuItem, MenuKey } from "@/lib/navigation";

type Option = { id: string; title: string };
export type LinkOptions = { collections: Option[]; products: Option[]; pages: Option[]; posts: Option[] };
type Row = { id: string; title: string; type: LinkType; ref: string; url: string; depth: 0 | 1 };

const newId = () => Math.random().toString(36).slice(2, 10);
const flatten = (items: MenuItem[]): Row[] => items.flatMap((i) => [{ ...i, depth: 0 as const }, ...i.children.map((c) => ({ ...c, depth: 1 as const }))]);
const nest = (rows: Row[]): MenuItem[] => {
  const out: MenuItem[] = [];
  for (const { depth, ...r } of rows) {
    if (depth === 1 && out.length) out[out.length - 1].children.push(r as MenuItem);
    else out.push({ ...r, children: [] } as MenuItem);
  }
  return out;
};

const FIXED: { value: string; label: string }[] = [
  { value: "home:", label: "Accueil" },
  { value: "all:", label: "Tous les produits" },
  { value: "search:", label: "Recherche" },
  { value: "blog:", label: "Blog" },
  { value: "url:", label: "Adresse personnalisée…" },
];

export function MenuEditor({ menuKey, title, hint, initial, options }: { menuKey: MenuKey; title: string; hint: string; initial: MenuItem[]; options: LinkOptions }) {
  const [rows, setRows] = useState<Row[]>(() => flatten(initial));
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [pending, start] = useTransition();

  const update = (next: Row[]) => { setRows(next); setDirty(true); setMsg(null); };
  const patch = (i: number, p: Partial<Row>) => update(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const titleOf = (type: LinkType, ref: string) => {
    const list = { collection: options.collections, product: options.products, page: options.pages, post: options.posts }[type as "collection"];
    return list?.find((o) => o.id === ref)?.title ?? FIXED.find((f) => f.value === `${type}:`)?.label ?? "";
  };
  const choose = (i: number, value: string) => {
    const [type, ref = ""] = value.split(":") as [LinkType, string];
    const r = rows[i];
    // Le nom suit le lien tant qu'il n'a pas été personnalisé.
    const auto = !r.title || r.title === titleOf(r.type, r.ref);
    patch(i, { type, ref, ...(auto && type !== "url" ? { title: titleOf(type, ref) } : {}) });
  };
  // Déplacer un lien emporte ses sous-liens avec lui.
  const block = (i: number) => { let end = i + 1; if (rows[i].depth === 0) while (end < rows.length && rows[end].depth === 1) end++; return end; };
  const move = (i: number, dir: -1 | 1) => {
    const end = block(i);
    const chunk = rows.slice(i, end);
    const rest = [...rows.slice(0, i), ...rows.slice(end)];
    let at = i;
    if (dir === -1) { at = i - 1; if (chunk[0].depth === 0) while (at > 0 && rest[at].depth === 1) at--; }
    else { at = i + 1; if (chunk[0].depth === 0) { while (at < rest.length && rest[at].depth === 1) at++; } }
    at = Math.max(0, Math.min(rest.length, at));
    update([...rest.slice(0, at), ...chunk, ...rest.slice(at)]);
  };
  const remove = (i: number) => update([...rows.slice(0, i), ...rows.slice(block(i))]);
  const indent = (i: number) => {
    if (i === 0) return;
    const hasChildren = block(i) > i + 1;
    if (hasChildren) return setMsg({ error: "Ce lien a déjà des sous-liens : il ne peut pas devenir lui-même un sous-lien (un seul niveau)." });
    patch(i, { depth: rows[i].depth === 0 ? 1 : 0 });
  };
  const add = () => update([...rows, { id: newId(), title: "", type: "collection", ref: "", url: "", depth: 0 }]);
  const save = () => start(async () => {
    setMsg(null);
    const res = await saveMenu(menuKey, nest(rows));
    setMsg(res);
    if (res.ok) setDirty(false);
  });

  const group = (label: string, type: LinkType, list: Option[]) => list.length > 0 && (
    <optgroup label={label}>{list.map((o) => <option key={o.id} value={`${type}:${o.id}`}>{o.title}</option>)}</optgroup>
  );

  return (
    <section className="card overflow-hidden">
      <div className="card-h flex-col items-start gap-0.5">
        <h2 className="text-sm font-[650]">{title}</h2>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      {rows.length ? (
        <ul>
          {rows.map((r, i) => (
            <li key={r.id} className={`flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 ${r.depth ? "bg-[#fafafa] pl-12" : ""}`}>
              {r.depth === 1 && <span className="-ml-5 text-muted" aria-hidden>↳</span>}
              <input value={r.title} onChange={(e) => patch(i, { title: e.target.value })} maxLength={60} placeholder="Nom du lien" aria-label="Nom du lien" className="input h-8 w-40 flex-1 sm:flex-none" />
              <select value={`${r.type}:${r.type === "url" ? "" : r.ref}`} onChange={(e) => choose(i, e.target.value)} aria-label="Lien vers" className="input h-8 min-w-0 flex-1">
                {!r.ref && ["collection", "product", "page", "post"].includes(r.type) && <option value={`${r.type}:`}>Choisir un lien…</option>}
                {FIXED.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                {group("Collections", "collection", options.collections)}
                {group("Pages", "page", options.pages)}
                {group("Articles de blog", "post", options.posts)}
                {group("Produits", "product", options.products)}
              </select>
              {r.type === "url" && <input value={r.url} onChange={(e) => patch(i, { url: e.target.value })} maxLength={500} placeholder="/pages/contact ou https://…" aria-label="Adresse" className="input h-8 w-full sm:w-56" />}
              <span className="flex items-center gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="btn h-8 w-8 px-0" aria-label="Monter">↑</button>
                <button type="button" onClick={() => move(i, 1)} disabled={block(i) >= rows.length} className="btn h-8 w-8 px-0" aria-label="Descendre">↓</button>
                <button type="button" onClick={() => indent(i)} disabled={i === 0} className="btn h-8 px-2 text-xs" title={r.depth ? "Remettre au premier niveau" : "Mettre dans le menu déroulant du lien au-dessus"}>{r.depth ? "← Sortir" : "→ Sous-lien"}</button>
                <button type="button" onClick={() => remove(i)} className="btn h-8 w-8 px-0 text-[#8e0b21]" aria-label={`Supprimer ${r.title || "ce lien"}`}>✕</button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-center text-muted">Ce menu est vide.</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <button type="button" onClick={add} className="btn">+ Ajouter un lien</button>
        <span className="flex items-center gap-3">
          {msg?.error && <span role="alert" className="text-[13px] text-[#8e0b21]">{msg.error}</span>}
          {msg?.ok && <span role="status" className="text-[13px] text-[#0c5132]">Menu enregistré.</span>}
          <button type="button" onClick={save} disabled={pending || !dirty} className="btn btn-primary">{pending ? "Enregistrement…" : "Enregistrer le menu"}</button>
        </span>
      </div>
    </section>
  );
}
