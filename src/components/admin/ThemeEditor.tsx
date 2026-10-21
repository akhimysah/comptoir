"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { publish, saveTheme } from "@/app/admin/theme/actions";
import { storeFontVars } from "@/components/store/fonts";
import { Sections } from "@/components/store/Sections";
import type { CardCollection, CardPost, CardProduct, StoreInfo } from "@/components/store/types";
import { blankSection, FONTS, PRESETS, SECTION_LABELS, themeVars, type FontKey, type Section, type SectionType, type Theme } from "@/lib/theme";
import { cx } from "@/lib/utils";
import { ImageField } from "./ImageField";
import { MenuPopover } from "./MenuPopover";

const COLOR_LABELS: Record<keyof Theme["colors"], string> = {
  background: "Fond",
  surface: "Encadrés",
  text: "Texte",
  muted: "Texte secondaire",
  accent: "Boutons",
  accentText: "Texte des boutons",
};

/** Icônes de l'éditeur (traits fins, comme Polaris). */
export function I({ n, className = "h-5 w-5" }: { n: string; className?: string }) {
  const d: Record<string, ReactNode> = {
    exit: <><path d="M9 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4" /><path d="m13 7 3 3-3 3M8 10h8" /></>,
    sections: <><rect x="3" y="4" width="14" height="4" rx="1" /><rect x="3" y="12" width="14" height="4" rx="1" /></>,
    settings: <><circle cx="10" cy="10" r="2.5" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></>,
    home: <path d="M3 9.5 10 3l7 6.5V17h-4.5v-5h-5v5H3z" />,
    desktop: <><rect x="2.5" y="4" width="15" height="10" rx="1.5" /><path d="M7 17h6" /></>,
    tablet: <><rect x="4" y="2.5" width="12" height="15" rx="1.5" /><path d="M9 15h2" /></>,
    mobile: <><rect x="5.5" y="2.5" width="9" height="15" rx="1.5" /><path d="M9 15h2" /></>,
    undo: <><path d="M7 6 3.5 9.5 7 13" /><path d="M4 9.5h8a4 4 0 0 1 0 8H9" /></>,
    redo: <><path d="m13 6 3.5 3.5L13 13" /><path d="M16 9.5H8a4 4 0 0 0 0 8h3" /></>,
    dots: <><circle cx="4.5" cy="10" r="1.3" fill="currentColor" stroke="none" /><circle cx="10" cy="10" r="1.3" fill="currentColor" stroke="none" /><circle cx="15.5" cy="10" r="1.3" fill="currentColor" stroke="none" /></>,
    eye: <><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" /><circle cx="10" cy="10" r="2.5" /></>,
    eyeOff: <><path d="M3 3l14 14M8.5 8.6A2.5 2.5 0 0 0 11.4 11.5M6.2 6.3C3.6 7.9 2 10 2 10s3 5.5 8 5.5c1.5 0 2.8-.4 3.9-1M9 4.6c.3 0 .7-.1 1-.1 5 0 8 5.5 8 5.5s-.8 1.5-2.3 2.9" /></>,
    plus: <path d="M10 4v12M4 10h12" />,
    chevron: <path d="m7 5 5 5-5 5" />,
    back: <path d="m12 5-5 5 5 5" />,
    grip: <><circle cx="7.5" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12.5" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="7.5" cy="10" r="1" fill="currentColor" stroke="none" /><circle cx="12.5" cy="10" r="1" fill="currentColor" stroke="none" /><circle cx="7.5" cy="15" r="1" fill="currentColor" stroke="none" /><circle cx="12.5" cy="15" r="1" fill="currentColor" stroke="none" /></>,
    header: <><rect x="3" y="4" width="14" height="12" rx="1.5" /><path d="M3 8h14" /></>,
    footer: <><rect x="3" y="4" width="14" height="12" rx="1.5" /><path d="M3 12h14" /></>,
    text: <path d="M4 5h12M4 9h12M4 13h8" />,
    image: <><rect x="3" y="4" width="14" height="12" rx="1.5" /><path d="m3 14 4-4 3 3 2-2 5 5" /><circle cx="13" cy="8" r="1.2" /></>,
    grid: <><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="11" y="3" width="6" height="6" rx="1" /><rect x="3" y="11" width="6" height="6" rx="1" /><rect x="11" y="11" width="6" height="6" rx="1" /></>,
    product: <><path d="M4 7h12l-1 9H5z" /><path d="M7.5 7V5.5a2.5 2.5 0 0 1 5 0V7" /></>,
    quote: <path d="M5 12V8a3 3 0 0 1 3-3M12 12V8a3 3 0 0 1 3-3M5 12h3v3H5zM12 12h3v3h-3z" />,
    mail: <><rect x="3" y="5" width="14" height="10" rx="1.5" /><path d="m3 6 7 5 7-5" /></>,
    faq: <><circle cx="10" cy="10" r="7.5" /><path d="M8 8a2 2 0 1 1 3 1.7c-.7.4-1 .8-1 1.5M10 14h.01" /></>,
    marquee: <path d="M3 10h14M14 7l3 3-3 3" />,
    clock: <><circle cx="10" cy="10" r="7.5" /><path d="M10 6v4l2.5 1.5" /></>,
    video: <><rect x="3" y="5" width="10" height="10" rx="1.5" /><path d="m13 8 4-2v8l-4-2" /></>,
    slides: <><rect x="5" y="5" width="10" height="10" rx="1.5" /><path d="M2.5 7.5v5M17.5 7.5v5" /></>,
    columns: <><rect x="3" y="4" width="4" height="12" rx="1" /><rect x="8" y="4" width="4" height="12" rx="1" /><rect x="13" y="4" width="4" height="12" rx="1" /></>,
    blog: <><rect x="4" y="3" width="12" height="14" rx="1.5" /><path d="M7 7h6M7 10h6M7 13h4" /></>,
    folder: <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h3l2 2h6A1.5 1.5 0 0 1 17 7.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z" />,
    trash: <><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" /></>,
    check: <path d="m4 10.5 4 4 8-9" />,
  };
  return <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d[n]}</svg>;
}

const menuItem = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-[#f1f1f1]";
const SECTION_ICON: Record<SectionType, string> = { hero: "image", featured: "product", text: "text", banner: "image", collections: "folder", slideshow: "slides", multicolumn: "columns", testimonials: "quote", newsletter: "mail", faq: "faq", marquee: "marquee", featuredProduct: "product", countdown: "clock", gallery: "grid", video: "video", blog: "blog" };
const DEVICES = { desktop: { label: "Ordinateur", width: "100%" }, tablet: { label: "Tablette", width: "768px" }, mobile: { label: "Mobile", width: "390px" } } as const;
type Device = keyof typeof DEVICES;
type Panel = { kind: "sections" } | { kind: "settings" } | { kind: "section"; id: string } | { kind: "announcement" } | { kind: "header" } | { kind: "footer" };

/**
 * Éditeur de thème plein écran, sur le modèle de l'éditeur Shopify : barre du haut (quitter, nom, page, appareil,
 * annuler / rétablir, Enregistrer), colonne de gauche (En-tête, Modèle, Pied de page), aperçu au centre.
 */
export function ThemeEditor({ themeId, name, published, initial, store, products, collections, posts = [] }: { themeId: string; name: string; published: boolean; initial: Theme; store: StoreInfo; products: CardProduct[]; collections: CardCollection[]; posts?: CardPost[] }) {
  const [theme, setThemeRaw] = useState<Theme>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [panel, setPanel] = useState<Panel>({ kind: "sections" });
  const [device, setDevice] = useState<Device>("desktop");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const history = useRef<{ past: Theme[]; future: Theme[] }>({ past: [], future: [] });
  const [, bump] = useState(0);
  const dirty = JSON.stringify(theme) !== saved;

  // Historique pour Annuler / Rétablir (50 états).
  const setTheme = useCallback((fn: (t: Theme) => Theme) => {
    setThemeRaw((t) => {
      const next = fn(t);
      if (next === t) return t;
      history.current.past = [...history.current.past.slice(-49), t];
      history.current.future = [];
      return next;
    });
    bump((n) => n + 1);
  }, []);
  const undo = () => { const p = history.current.past.pop(); if (!p) return; setThemeRaw((t) => { history.current.future.push(t); return p; }); bump((n) => n + 1); };
  const redo = () => { const f = history.current.future.pop(); if (!f) return; setThemeRaw((t) => { history.current.past.push(t); return f; }); bump((n) => n + 1); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); if (dirty && !pending) save(); }
    };
    const onLeave = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("keydown", onKey); window.addEventListener("beforeunload", onLeave);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", onLeave); };
  });

  const patch = (p: Partial<Theme>) => setTheme((t) => ({ ...t, ...p }));
  const updateSection = (id: string, p: Partial<Section>) => setTheme((t) => ({ ...t, sections: t.sections.map((s) => (s.id === id ? ({ ...s, ...p } as Section) : s)) }));
  const moveTo = (from: number, to: number) => setTheme((t) => { if (from === to || to < 0 || to >= t.sections.length) return t; const s = [...t.sections]; const [x] = s.splice(from, 1); s.splice(to, 0, x); return { ...t, sections: s }; });
  const addSection = (type: SectionType) => { const s = blankSection(type); setTheme((t) => ({ ...t, sections: [...t.sections, s] })); setPanel({ kind: "section", id: s.id }); setAdding(false); };
  const removeSection = (id: string) => { setTheme((t) => ({ ...t, sections: t.sections.filter((s) => s.id !== id) })); setPanel({ kind: "sections" }); };

  const save = () =>
    start(async () => {
      setError(null);
      const res = await saveTheme(themeId, JSON.stringify(theme));
      if (res.error) setError(res.error);
      else setSaved(JSON.stringify(theme));
    });

  const current = panel.kind === "section" ? theme.sections.find((s) => s.id === panel.id) ?? null : null;
  const selectedId = current?.id ?? null;
  const dragFrom = useRef<number | null>(null);
  const iconBtn = (active = false) => cx("grid h-8 w-8 place-items-center rounded-lg text-[#4a4a4a] hover:bg-[#f1f1f1] disabled:opacity-30 disabled:hover:bg-transparent", active && "bg-[#e3e3e3] text-ink");

  /** Ligne de la colonne de gauche (section, en-tête, barre d'annonce…). */
  const Row = ({ icon, label, sub, active, onClick, hidden, onToggle, draggable, i, chevron = true }: { icon: string; label: string; sub?: string; active?: boolean; onClick: () => void; hidden?: boolean; onToggle?: () => void; draggable?: boolean; i?: number; chevron?: boolean }) => (
    <div
      className={cx("group flex items-center gap-1 rounded-lg pr-1 hover:bg-[#f1f1f1]", active && "bg-[#ebebeb]", hidden && "opacity-50")}
      draggable={draggable}
      onDragStart={draggable ? () => { dragFrom.current = i!; } : undefined}
      onDragOver={draggable ? (e) => e.preventDefault() : undefined}
      onDrop={draggable ? () => { if (dragFrom.current != null) moveTo(dragFrom.current, i!); dragFrom.current = null; } : undefined}
    >
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2 text-left text-[13px]">
        {chevron ? <I n="chevron" className="h-3.5 w-3.5 shrink-0 text-[#8a8a8a]" /> : <span className="w-3.5" />}
        <I n={icon} className="h-4 w-4 shrink-0 text-[#4a4a4a]" />
        <span className="min-w-0 flex-1 truncate">{label}{sub && <span className="ml-1.5 text-xs text-muted">{sub}</span>}</span>
      </button>
      {draggable && <span className="cursor-grab text-[#b5b5b5] opacity-0 group-hover:opacity-100" aria-hidden><I n="grip" className="h-4 w-4" /></span>}
      {onToggle && <button type="button" onClick={onToggle} className={cx("grid h-7 w-7 place-items-center rounded-md text-[#6b6b6b] hover:bg-[#e3e3e3]", !hidden && "opacity-0 group-hover:opacity-100")} aria-label={hidden ? "Afficher" : "Masquer"}><I n={hidden ? "eyeOff" : "eye"} className="h-4 w-4" /></button>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f1f1f1] text-ink">
      {/* Barre du haut */}
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line bg-white px-2">
        <Link href="/admin/theme" className={iconBtn()} aria-label="Quitter l'éditeur" title="Quitter"><I n="exit" /></Link>
        <span className="mx-1 h-6 w-px bg-line" />
        <button type="button" onClick={() => setPanel({ kind: "sections" })} className={iconBtn(panel.kind !== "settings")} aria-label="Sections" title="Sections"><I n="sections" /></button>
        <button type="button" onClick={() => setPanel({ kind: "settings" })} className={iconBtn(panel.kind === "settings")} aria-label="Paramètres du thème" title="Paramètres du thème"><I n="settings" /></button>
        <div className="mx-auto flex min-w-0 items-center gap-4 text-[13px]">
          <span className="flex min-w-0 items-center gap-2"><span className="truncate font-[550]">{name}</span>{published ? <span className="rounded-full bg-[#cdfed4] px-2 py-0.5 text-xs font-[550] text-[#0c5132]">Actif</span> : <span className="rounded-full bg-[#e3e3e3] px-2 py-0.5 text-xs font-[550]">Brouillon</span>}</span>
          <span className="hidden items-center gap-1.5 text-[#4a4a4a] sm:flex"><I n="home" className="h-4 w-4" />Page d&apos;accueil</span>
        </div>
        <div className="hidden items-center gap-0.5 md:flex">
          {(Object.keys(DEVICES) as Device[]).map((d) => <button key={d} type="button" onClick={() => setDevice(d)} className={iconBtn(device === d)} aria-label={DEVICES[d].label} title={DEVICES[d].label}><I n={d} /></button>)}
        </div>
        <span className="mx-1 hidden h-6 w-px bg-line md:block" />
        <button type="button" onClick={undo} disabled={!history.current.past.length} className={iconBtn()} aria-label="Annuler" title="Annuler (⌘Z)"><I n="undo" /></button>
        <button type="button" onClick={redo} disabled={!history.current.future.length} className={iconBtn()} aria-label="Rétablir" title="Rétablir (⇧⌘Z)"><I n="redo" /></button>
        <MenuPopover label="Plus d'actions" buttonClassName={iconBtn()}>
          <a href={`/s/${store.slug}/preview?theme=${themeId}`} target="_blank" className={menuItem}>Aperçu dans un nouvel onglet</a>
          <Link href={`/admin/theme/${themeId}/code`} className={menuItem}>Modifier le code</Link>
          <Link href="/admin/theme" className={menuItem}>Bibliothèque de thèmes</Link>
        </MenuPopover>
        {!published && (
          <form action={publish} onSubmit={(e) => { if (dirty) { e.preventDefault(); setError("Enregistrez vos modifications avant de publier."); } else if (!confirm(`Publier « ${name} » ? La boutique en ligne changera immédiatement.`)) e.preventDefault(); }}>
            <input type="hidden" name="id" value={themeId} />
            <button className="btn h-8 text-[13px]">Publier</button>
          </form>
        )}
        <button type="button" onClick={save} disabled={!dirty || pending} className="btn btn-primary ml-1 h-8 text-[13px]">{pending ? "Enregistrement…" : "Enregistrer"}</button>
      </header>
      {error && <p role="alert" className="border-b border-[#fedad9] bg-[#fff4f4] px-4 py-2 text-[13px] text-[#8e0b21]">{error}</p>}

      <div className="flex min-h-0 flex-1">
        {/* Colonne de gauche */}
        <aside className="flex w-[300px] shrink-0 flex-col border-r border-line bg-white">
          {panel.kind === "settings" ? (
            <SettingsPanel theme={theme} patch={patch} />
          ) : current ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center gap-1 border-b border-line px-2 py-2">
                <button type="button" onClick={() => setPanel({ kind: "sections" })} className={iconBtn()} aria-label="Retour"><I n="back" /></button>
                <span className="truncate text-[13px] font-[650]">{SECTION_LABELS[current.type]}</span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
                <SectionFields s={current} collections={collections} products={products} onChange={(p) => updateSection(current.id, p)} />
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-line p-2">
                <button type="button" onClick={() => updateSection(current.id, { hidden: !current.hidden })} className="btn h-8 gap-1.5 text-[13px]"><I n={current.hidden ? "eye" : "eyeOff"} className="h-4 w-4" />{current.hidden ? "Afficher la section" : "Masquer la section"}</button>
                <button type="button" onClick={() => removeSection(current.id)} className="btn h-8 gap-1.5 text-[13px] text-[#8e0b21]"><I n="trash" className="h-4 w-4" />Retirer</button>
              </div>
            </div>
          ) : panel.kind === "announcement" ? (
            <SubPanel title="Barre d'annonces" onBack={() => setPanel({ kind: "sections" })} iconBtn={iconBtn}>
              <label className="label">Texte<span className="hint">Ex. « Livraison offerte dès 60 € ». Vide : la barre est masquée.</span><input id="theme-announcement" className="input" maxLength={140} value={theme.announcement} onChange={(e) => patch({ announcement: e.target.value })} /></label>
            </SubPanel>
          ) : panel.kind === "header" ? (
            <SubPanel title="En-tête" onBack={() => setPanel({ kind: "sections" })} iconBtn={iconBtn}>
              <p className="text-[13px] text-muted">L&apos;en-tête affiche le nom de la boutique, le menu principal, la recherche, le compte et le panier.</p>
              <Link href="/admin/navigation" className="btn h-8 self-start text-[13px]">Modifier le menu</Link>
              <Link href="/admin/settings" className="btn h-8 self-start text-[13px]">Nom et logo de la boutique</Link>
            </SubPanel>
          ) : panel.kind === "footer" ? (
            <SubPanel title="Pied de page" onBack={() => setPanel({ kind: "sections" })} iconBtn={iconBtn}>
              <p className="text-[13px] text-muted">Le pied de page affiche l&apos;inscription à la newsletter, le menu de pied de page et les politiques.</p>
              <Link href="/admin/navigation" className="btn h-8 self-start text-[13px]">Menu de pied de page</Link>
              <Link href="/admin/settings/policies" className="btn h-8 self-start text-[13px]">Politiques</Link>
            </SubPanel>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="border-b border-line px-4 py-3 text-[13px] font-[650]">Page d&apos;accueil</div>
              <div className="border-b border-line p-2">
                <div className="px-2 pb-1 pt-1 text-xs font-[650] text-[#4a4a4a]">Groupe d&apos;en-tête</div>
                <Row icon="marquee" label="Barre d'annonces" active={false} hidden={!theme.announcement} onClick={() => setPanel({ kind: "announcement" })} onToggle={() => setPanel({ kind: "announcement" })} />
                <Row icon="header" label="En-tête" onClick={() => setPanel({ kind: "header" })} />
              </div>
              <div className="border-b border-line p-2">
                <div className="px-2 pb-1 pt-1 text-xs font-[650] text-[#4a4a4a]">Modèle</div>
                {theme.sections.map((s, i) => (
                  <Row key={s.id} i={i} draggable icon={SECTION_ICON[s.type]} label={SECTION_LABELS[s.type]} sub={"title" in s && s.title ? s.title : undefined} active={selectedId === s.id} hidden={s.hidden} onClick={() => setPanel({ kind: "section", id: s.id })} onToggle={() => updateSection(s.id, { hidden: !s.hidden })} />
                ))}
                <div className="relative">
                  <button type="button" onClick={() => setAdding((a) => !a)} className="flex items-center gap-2 px-2 py-2 text-[13px] font-[550] text-[#005bd3] hover:underline"><I n="plus" className="h-4 w-4" />Ajouter une section</button>
                  {adding && (
                    <div className="absolute left-2 top-full z-10 grid w-[270px] grid-cols-1 gap-0.5 rounded-xl border border-line bg-white p-1.5 shadow-[0_8px_24px_rgba(0,0,0,.15)]">
                      {(Object.keys(SECTION_LABELS) as SectionType[]).map((t) => <button key={t} type="button" onClick={() => addSection(t)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-[#f1f1f1]"><I n={SECTION_ICON[t]} className="h-4 w-4 text-[#4a4a4a]" />{SECTION_LABELS[t]}</button>)}
                    </div>
                  )}
                </div>
              </div>
              <div className="p-2">
                <div className="px-2 pb-1 pt-1 text-xs font-[650] text-[#4a4a4a]">Groupe de pied de page</div>
                <Row icon="mail" label="Newsletter" onClick={() => setPanel({ kind: "footer" })} chevron={false} />
                <Row icon="footer" label="Pied de page" onClick={() => setPanel({ kind: "footer" })} />
              </div>
            </div>
          )}
        </aside>

        {/* Aperçu */}
        <main className="flex min-w-0 flex-1 justify-center overflow-hidden p-3" onClick={() => setAdding(false)}>
          <div className={cx("flex h-full flex-col overflow-hidden rounded-xl border border-line bg-white shadow-sm transition-[width]", device !== "desktop" && "mx-auto")} style={{ width: DEVICES[device].width, maxWidth: "100%" }}>
            <div
              style={themeVars(theme) as React.CSSProperties}
              className={cx(storeFontVars, "theme-preview min-h-0 flex-1 overflow-y-auto bg-[var(--c-bg)] font-[family-name:var(--t-body)] text-[var(--c-text)]")}
              onClickCapture={(e) => {
                const a = (e.target as HTMLElement).closest("a");
                if (a) e.preventDefault();
                const sec = (e.target as HTMLElement).closest<HTMLElement>("[data-section]");
                if (sec) setPanel({ kind: "section", id: sec.dataset.section! });
                else if ((e.target as HTMLElement).closest("[data-announcement]")) setPanel({ kind: "announcement" });
                else if ((e.target as HTMLElement).closest("[data-header]")) setPanel({ kind: "header" });
              }}
            >
              {theme.announcement && <div data-announcement className="cursor-pointer bg-[var(--c-accent)] px-4 py-2 text-center text-sm font-medium text-[var(--c-accent-text)] outline-[#005bd3] hover:outline hover:outline-2 hover:-outline-offset-2">{theme.announcement}</div>}
              <div data-header className={cx("cursor-pointer border-b border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] outline-[#005bd3] hover:outline hover:outline-2 hover:-outline-offset-2", panel.kind === "header" && "outline outline-2 -outline-offset-2")}>
                <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-4">
                  <span className="mr-auto font-[family-name:var(--t-display)] text-xl font-semibold md:text-2xl">{store.name}</span>
                  <span className="hidden text-sm md:inline">Tous les produits</span>
                  <span className="text-sm font-medium">Panier</span>
                </div>
              </div>
              <Sections sections={theme.sections} products={products} collections={collections} posts={posts} store={store} selectedId={selectedId} />
              <style>{`.theme-preview [data-section]{cursor:pointer;position:relative}.theme-preview [data-section]:hover{outline:2px solid #005bd3;outline-offset:-2px}`}</style>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function SubPanel({ title, onBack, iconBtn, children }: { title: string; onBack: () => void; iconBtn: () => string; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-line px-2 py-2"><button type="button" onClick={onBack} className={iconBtn()} aria-label="Retour"><I n="back" /></button><span className="text-[13px] font-[650]">{title}</span></div>
      <div className="flex flex-col gap-3 overflow-y-auto p-3">{children}</div>
    </div>
  );
}

/** Paramètres du thème (roue dentée) : couleurs, polices, arrondis, modèles de style. */
function SettingsPanel({ theme, patch }: { theme: Theme; patch: (p: Partial<Theme>) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="border-b border-line px-4 py-3 text-[13px] font-[650]">Paramètres du thème</div>
      <div className="flex flex-col gap-5 p-3">
        <div>
          <span className="eyebrow">Couleurs</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(Object.keys(COLOR_LABELS) as (keyof Theme["colors"])[]).map((k) => (
              <label key={k} className="flex items-center gap-2 text-[13px]">
                <input id={`color-${k}`} type="color" value={theme.colors[k]} onChange={(e) => patch({ colors: { ...theme.colors, [k]: e.target.value } })} className="h-8 w-10 cursor-pointer rounded border border-line bg-white p-0.5" />
                {COLOR_LABELS[k]}
              </label>
            ))}
          </div>
        </div>
        <label className="label">Typographie
          <select id="theme-font" className="input" value={theme.font} onChange={(e) => patch({ font: e.target.value as FontKey })}>
            {(Object.keys(FONTS) as FontKey[]).map((f) => <option key={f} value={f}>{FONTS[f].label}</option>)}
          </select>
        </label>
        <label className="label">Arrondis
          <select id="theme-radius" className="input" value={theme.radius} onChange={(e) => patch({ radius: e.target.value as Theme["radius"] })}>
            <option value="none">Aucun</option>
            <option value="small">Légers</option>
            <option value="large">Prononcés</option>
          </select>
        </label>
        <div>
          <span className="eyebrow">Palettes prêtes à l&apos;emploi</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {Object.entries(PRESETS).map(([k, p]) => (
              <button key={k} type="button" onClick={() => patch({ colors: p.colors, font: p.font, radius: p.radius })} className="flex items-center gap-2 rounded-lg border border-line p-2 text-left text-[13px] hover:border-[#005bd3]">
                <span className="flex h-8 w-10 overflow-hidden rounded" style={{ background: p.colors.background }}><span className="m-auto h-3 w-5 rounded-sm" style={{ background: p.colors.accent }} /></span>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionFields({ s, collections, products, onChange }: { s: Section; collections: CardCollection[]; products: CardProduct[]; onChange: (p: Partial<Section>) => void }) {
  const text = (key: string, label: string, max: number, multiline = false) => {
    const value = (s as Record<string, unknown>)[key] as string;
    return (
      <label className="label">
        {label}
        {multiline ? (
          <textarea id={`sec-${key}`} className="input min-h-[120px]" maxLength={max} value={value} onChange={(e) => onChange({ [key]: e.target.value } as Partial<Section>)} />
        ) : (
          <input id={`sec-${key}`} className="input" maxLength={max} value={value} onChange={(e) => onChange({ [key]: e.target.value } as Partial<Section>)} />
        )}
      </label>
    );
  };
  switch (s.type) {
    case "hero":
      return (
        <>
          {text("title", "Titre", 120)}
          {text("subtitle", "Sous-titre", 300, true)}
          {text("buttonLabel", "Texte du bouton", 40)}
          {text("buttonLink", "Lien du bouton", 200)}
          <ImageField id="sec-image" label="Image de fond" value={s.image} onChange={(image) => onChange({ image })} />
        </>
      );
    case "featured":
      return (
        <>
          {text("title", "Titre", 120)}
          <label className="label">Produits affichés
            <select id="sec-collection" className="input" value={s.collectionHandle ?? ""} onChange={(e) => onChange({ collectionHandle: e.target.value || null })}>
              <option value="">Les plus récents</option>
              {collections.map((c) => <option key={c.handle} value={c.handle}>Collection : {c.title}</option>)}
            </select>
          </label>
          <label className="label">Nombre de produits
            <input id="sec-limit" type="number" min={2} max={12} className="input" value={s.limit} onChange={(e) => onChange({ limit: Math.max(2, Math.min(12, Number(e.target.value) || 4)) })} />
          </label>
        </>
      );
    case "text":
      return <>{text("title", "Titre", 120)}{text("body", "Texte", 2000, true)}</>;
    case "banner":
      return (
        <>
          {text("title", "Titre", 120)}
          {text("buttonLabel", "Texte du bouton", 40)}
          {text("buttonLink", "Lien du bouton", 200)}
          <ImageField id="sec-image" label="Image" value={s.image} onChange={(image) => onChange({ image })} />
        </>
      );
    case "collections":
      return <>{text("title", "Titre", 120)}<p className="text-sm text-muted">Affiche toutes vos collections avec leur image.</p></>;
    case "slideshow":
      return (
        <ListEditor label="Diapositives" items={s.slides} max={5} min={1} blank={{ title: "Nouvelle diapositive", subtitle: "", buttonLabel: "", buttonLink: "/products", image: null }} onChange={(slides) => onChange({ slides })}
          render={(sl, set, i) => (<>
            <input className="input" maxLength={120} value={sl.title} placeholder="Titre" onChange={(e) => set({ title: e.target.value })} />
            <textarea className="input min-h-[60px]" maxLength={300} value={sl.subtitle} placeholder="Sous-titre" onChange={(e) => set({ subtitle: e.target.value })} />
            <div className="grid grid-cols-2 gap-2"><input className="input" maxLength={40} value={sl.buttonLabel} placeholder="Texte du bouton" onChange={(e) => set({ buttonLabel: e.target.value })} /><input className="input" maxLength={200} value={sl.buttonLink} placeholder="Lien" onChange={(e) => set({ buttonLink: e.target.value })} /></div>
            <ImageField id={`sec-slide-${i}`} label="Image" value={sl.image} onChange={(image) => set({ image })} />
          </>)} />
      );
    case "multicolumn":
      return (<>{text("title", "Titre", 120)}
        <ListEditor label="Colonnes" items={s.columns} max={6} blank={{ icon: "✨", title: "Titre", text: "" }} onChange={(columns) => onChange({ columns })}
          render={(c, set) => (<>
            <div className="grid grid-cols-[64px_1fr] gap-2"><input className="input text-center" maxLength={4} value={c.icon} placeholder="Icône" onChange={(e) => set({ icon: e.target.value })} /><input className="input" maxLength={80} value={c.title} placeholder="Titre" onChange={(e) => set({ title: e.target.value })} /></div>
            <textarea className="input min-h-[60px]" maxLength={300} value={c.text} placeholder="Texte" onChange={(e) => set({ text: e.target.value })} />
          </>)} /></>);
    case "testimonials":
      return (<>{text("title", "Titre", 120)}
        <ListEditor label="Témoignages" items={s.items} max={8} blank={{ quote: "", author: "", rating: 5 }} onChange={(items) => onChange({ items })}
          render={(it, set) => (<>
            <textarea className="input min-h-[60px]" maxLength={400} value={it.quote} placeholder="Citation" onChange={(e) => set({ quote: e.target.value })} />
            <div className="grid grid-cols-[1fr_90px] gap-2"><input className="input" maxLength={80} value={it.author} placeholder="Auteur" onChange={(e) => set({ author: e.target.value })} /><select className="input" value={it.rating} onChange={(e) => set({ rating: Number(e.target.value) })}>{[5, 4, 3, 2, 1, 0].map((n) => <option key={n} value={n}>{n ? `${n} ★` : "Sans note"}</option>)}</select></div>
          </>)} /></>);
    case "newsletter":
      return <>{text("title", "Titre", 120)}{text("body", "Texte", 300, true)}<p className="text-sm text-muted">Les inscrits apparaissent dans Clients, abonnés à la newsletter.</p></>;
    case "faq":
      return (<>{text("title", "Titre", 120)}
        <ListEditor label="Questions" items={s.items} max={12} blank={{ question: "", answer: "" }} onChange={(items) => onChange({ items })}
          render={(it, set) => (<>
            <input className="input" maxLength={200} value={it.question} placeholder="Question" onChange={(e) => set({ question: e.target.value })} />
            <textarea className="input min-h-[80px]" maxLength={1000} value={it.answer} placeholder="Réponse" onChange={(e) => set({ answer: e.target.value })} />
          </>)} /></>);
    case "marquee":
      return <>{text("body", "Texte qui défile", 200)}<p className="text-sm text-muted">Séparez les messages par « · ».</p></>;
    case "featuredProduct":
      return (<>{text("title", "Titre", 120)}
        <label className="label">Produit
          <select id="sec-product" className="input" value={s.productHandle ?? ""} onChange={(e) => onChange({ productHandle: e.target.value || null })}>
            <option value="">Le plus récent</option>
            {products.map((p) => <option key={p.handle} value={p.handle}>{p.title}</option>)}
          </select>
        </label></>);
    case "countdown":
      return (<>{text("title", "Titre", 120)}
        <label className="label">Date de fin<input id="sec-endsAt" type="date" className="input" value={s.endsAt.slice(0, 10)} onChange={(e) => onChange({ endsAt: e.target.value })} /></label>
        {text("buttonLabel", "Texte du bouton", 40)}{text("buttonLink", "Lien du bouton", 200)}</>);
    case "gallery":
      return (<>{text("title", "Titre", 120)}
        <ListEditor label="Images" items={s.images.map((url) => ({ url }))} max={8} blank={{ url: "" }} onChange={(items) => onChange({ images: items.map((i) => i.url).filter(Boolean) })}
          render={(it, set, i) => <ImageField id={`sec-gallery-${i}`} label="Image" value={it.url || null} onChange={(url) => set({ url: url ?? "" })} />} /></>);
    case "video":
      return <>{text("title", "Titre", 120)}{text("url", "Adresse de la vidéo (YouTube ou Vimeo)", 300)}</>;
    case "blog":
      return (<>{text("title", "Titre", 120)}
        <label className="label">Nombre d'articles<input id="sec-limit" type="number" min={1} max={6} className="input" value={s.limit} onChange={(e) => onChange({ limit: Math.max(1, Math.min(6, Number(e.target.value) || 3)) })} /></label></>);
  }
}

/** Liste d'éléments d'une section (diapositives, colonnes, questions…) : ajouter, retirer, réordonner. */
function ListEditor<T extends object>({ label, items, max, min = 0, blank, render, onChange }: { label: string; items: T[]; max: number; min?: number; blank: T; render: (item: T, set: (p: Partial<T>) => void, i: number) => ReactNode; onChange: (items: T[]) => void }) {
  const update = (i: number, p: Partial<T>) => onChange(items.map((it, j) => (j === i ? { ...it, ...p } : it)));
  const move = (i: number, d: number) => { const a = [...items]; const [x] = a.splice(i, 1); a.splice(i + d, 0, x); onChange(a); };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="eyebrow mb-1">{label} ({items.length}/{max})</legend>
      {items.map((it, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border border-line p-3">
          {render(it, (p) => update(i, p), i)}
          <div className="flex justify-end gap-1 text-xs">
            <button type="button" className="btn btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter">↑</button>
            <button type="button" className="btn btn-sm" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Descendre">↓</button>
            <button type="button" className="btn btn-sm text-[#8e0b21]" disabled={items.length <= min} onClick={() => onChange(items.filter((_, j) => j !== i))}>Retirer</button>
          </div>
        </div>
      ))}
      {items.length < max && <button type="button" className="btn btn-sm self-start" onClick={() => onChange([...items, blank])}>+ Ajouter</button>}
    </fieldset>
  );
}
