"use client";

import { useEffect, useRef, useState } from "react";
import { Thumb } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import type { CardProduct } from "./types";

type Result = { products: CardProduct[]; collections: { handle: string; title: string; count: number }[]; pages: { title: string; path: string }[] };

/** Recherche prédictive : résultats pendant la saisie, navigation au clavier, Entrée pour la page complète. */
export function PredictiveSearch({ slug, currency, rate = 1 }: { slug: string; currency: string; rate?: number }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const [top, setTop] = useState(64);
  // Sur mobile, le panneau se place juste sous l'en-tête (dont la hauteur varie).
  useEffect(() => {
    if (!open) return;
    // L'en-tête a un flou d'arrière-plan : le panneau « fixe » se place donc par rapport à lui, juste sous son bord.
    const place = () => setTop(Math.round(document.querySelector("header")?.getBoundingClientRect().height ?? 64));
    place();
    input.current?.focus();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place); window.removeEventListener("resize", place); };
  }, [open]);
  // Fermeture : Échap, ou clic en dehors du panneau.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onClick); };
  }, [open]);
  // Requête 200 ms après la dernière frappe ; une réponse en retard ne remplace pas une plus récente.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(null); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/s/${slug}/search/suggest?q=${encodeURIComponent(term)}`, { signal: ctrl.signal }).then((r) => r.json()).then((d: Result) => { setRes(d); setActive(-1); }).catch(() => {});
    }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, slug]);

  const links = res ? [
    ...res.products.map((p) => `/s/${slug}/p/${p.handle}`),
    ...res.collections.map((c) => `/s/${slug}/c/${c.handle}`),
    ...res.pages.map((p) => `/s/${slug}${p.path}`),
  ] : [];
  const all = `/s/${slug}/search?q=${encodeURIComponent(q.trim())}`;
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(links.length - 1, a + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)); }
    if (e.key === "Enter") { e.preventDefault(); if (q.trim()) location.href = active >= 0 ? links[active] : all; }
  };
  const m = (c: number) => formatMoney(Math.round(c * rate), currency);
  const item = (i: number) => `flex items-center gap-3 rounded-[var(--t-radius)] px-2 py-2 ${active === i ? "bg-[color-mix(in_srgb,var(--c-text)_8%,transparent)]" : "hover:bg-[color-mix(in_srgb,var(--c-text)_5%,transparent)]"}`;
  const empty = res && !res.products.length && !res.collections.length && !res.pages.length;
  let n = -1;

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Rechercher" aria-expanded={open} className="rounded-[var(--t-radius)] p-1.5 hover:opacity-70">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
      </button>
      {open && (
        <div style={{ "--search-top": `${top}px` } as React.CSSProperties} className="fixed inset-x-0 top-[var(--search-top)] z-40 mx-auto w-full max-w-2xl px-4 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[min(36rem,calc(100vw-2rem))] sm:px-0">
          <div className="overflow-hidden rounded-[calc(var(--t-radius)+4px)] border border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] bg-[var(--c-bg)] shadow-[0_18px_50px_-12px_rgba(0,0,0,.35)]">
            <div role="search" className="flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] px-4">
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[var(--c-muted)]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} maxLength={80} placeholder="Rechercher un produit…" aria-label="Rechercher un produit" role="combobox" aria-expanded={Boolean(res)} aria-controls="search-results" className="w-full bg-transparent py-3.5 outline-none" />
            </div>
            {q.trim().length >= 2 && (
              <div id="search-results" className="max-h-[min(70vh,520px)] overflow-y-auto p-2">
                {res === null ? <p className="px-2 py-3 text-sm text-[var(--c-muted)]">Recherche…</p> : empty ? (
                  <p className="px-2 py-3 text-sm text-[var(--c-muted)]">Aucun résultat pour « {q.trim()} ».</p>
                ) : (
                  <>
                    {res.products.length > 0 && <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-[var(--c-muted)]">Produits</p>}
                    {res.products.map((p) => { n++; const i = n; return (
                      <a key={p.id} href={links[i]} className={item(i)}>
                        <Thumb image={p.image} hue={p.hue} title={p.title} rounded="rounded-[calc(var(--t-radius)/2)]" className="h-12 w-10 shrink-0 text-xs" />
                        <span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.title}</span>{p.soldOut && <span className="text-xs text-[var(--c-muted)]">Épuisé</span>}</span>
                        <span className="text-sm tabular-nums">{p.maxPriceCents > p.priceCents ? "Dès " : ""}{m(p.priceCents)}</span>
                      </a>
                    ); })}
                    {res.collections.length > 0 && <p className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-[var(--c-muted)]">Collections</p>}
                    {res.collections.map((c) => { n++; const i = n; return <a key={c.handle} href={links[i]} className={item(i)}><span className="flex-1">{c.title}</span><span className="text-xs text-[var(--c-muted)]">{c.count} produit{c.count > 1 ? "s" : ""}</span></a>; })}
                    {res.pages.length > 0 && <p className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-[var(--c-muted)]">Pages</p>}
                    {res.pages.map((p) => { n++; const i = n; return <a key={p.path} href={links[i]} className={item(i)}>{p.title}</a>; })}
                  </>
                )}
                <a href={all} className="mt-1 block rounded-[var(--t-radius)] px-2 py-2.5 text-sm font-semibold hover:bg-[color-mix(in_srgb,var(--c-text)_5%,transparent)]">Voir tous les résultats pour « {q.trim()} » →</a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
