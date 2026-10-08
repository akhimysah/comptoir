"use client";

import { useState, useTransition } from "react";
import { saveTheme } from "@/app/admin/theme/actions";
import { storeFontVars } from "@/components/store/fonts";
import { Sections } from "@/components/store/Sections";
import type { CardCollection, CardProduct, StoreInfo } from "@/components/store/types";
import { blankSection, FONTS, PRESETS, SECTION_LABELS, themeVars, type FontKey, type Section, type SectionType, type Theme } from "@/lib/theme";
import { cx } from "@/lib/utils";
import { ImageField } from "./ImageField";

const COLOR_LABELS: Record<keyof Theme["colors"], string> = {
  background: "Fond",
  surface: "Encadrés",
  text: "Texte",
  muted: "Texte secondaire",
  accent: "Boutons",
  accentText: "Texte des boutons",
};

export function ThemeEditor({ initial, store, products, collections }: { initial: Theme; store: StoreInfo; products: CardProduct[]; collections: CardCollection[] }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"sections" | "style">("sections");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(theme) !== saved;

  const patch = (p: Partial<Theme>) => setTheme((t) => ({ ...t, ...p }));
  const updateSection = (id: string, p: Partial<Section>) => setTheme((t) => ({ ...t, sections: t.sections.map((s) => (s.id === id ? ({ ...s, ...p } as Section) : s)) }));
  const move = (i: number, d: -1 | 1) =>
    setTheme((t) => {
      const s = [...t.sections];
      const j = i + d;
      if (j < 0 || j >= s.length) return t;
      [s[i], s[j]] = [s[j], s[i]];
      return { ...t, sections: s };
    });

  const save = () =>
    start(async () => {
      setError(null);
      const res = await saveTheme(JSON.stringify(theme));
      if (res.error) setError(res.error);
      else setSaved(JSON.stringify(theme));
    });

  const current = theme.sections.find((s) => s.id === selected) ?? null;

  return (
    <div className="grid min-h-[calc(100vh-140px)] gap-5 xl:grid-cols-[360px_1fr]">
      <aside className="card flex min-w-0 flex-col self-start xl:sticky xl:top-6 xl:max-h-[calc(100vh-48px)]">
        <div className="flex border-b border-line">
          {(["sections", "style"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={cx("flex-1 px-4 py-3 text-sm font-semibold", tab === t ? "border-b-2 border-pine text-ink" : "text-muted")}>
              {t === "sections" ? "Sections" : "Style"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === "style" ? (
            <div className="flex flex-col gap-5">
              <div>
                <span className="eyebrow">Thèmes prêts à l'emploi</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {Object.entries(PRESETS).map(([k, p]) => (
                    <button key={k} type="button" onClick={() => patch({ colors: p.colors, font: p.font, radius: p.radius })} className="flex items-center gap-2 rounded-lg border border-line p-2 text-left text-sm hover:border-pine">
                      <span className="flex h-8 w-10 overflow-hidden rounded" style={{ background: p.colors.background }}>
                        <span className="m-auto h-3 w-5 rounded-sm" style={{ background: p.colors.accent }} />
                      </span>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(COLOR_LABELS) as (keyof Theme["colors"])[]).map((k) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <input id={`color-${k}`} type="color" value={theme.colors[k]} onChange={(e) => patch({ colors: { ...theme.colors, [k]: e.target.value } })} className="h-8 w-10 cursor-pointer rounded border border-line bg-white p-0.5" />
                    {COLOR_LABELS[k]}
                  </label>
                ))}
              </div>
              <label className="label">Polices
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
              <label className="label">Bandeau d'annonce<span className="hint">Ex. « Livraison offerte dès 60 € ». Laissez vide pour le masquer.</span>
                <input id="theme-announcement" className="input" maxLength={140} value={theme.announcement} onChange={(e) => patch({ announcement: e.target.value })} />
              </label>
            </div>
          ) : current ? (
            <div className="flex flex-col gap-4">
              <button type="button" className="self-start text-sm font-semibold text-pine" onClick={() => setSelected(null)}>← Toutes les sections</button>
              <h2 className="text-sm font-[650]">{SECTION_LABELS[current.type]}</h2>
              <SectionFields s={current} collections={collections} onChange={(p) => updateSection(current.id, p)} />
              <button type="button" className="btn btn-danger" onClick={() => { setTheme((t) => ({ ...t, sections: t.sections.filter((s) => s.id !== current.id) })); setSelected(null); }}>Retirer cette section</button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <ul className="flex flex-col gap-1.5">
                {theme.sections.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-1 rounded-lg border border-line bg-white">
                    <button type="button" className="min-w-0 flex-1 px-3 py-2.5 text-left text-sm" onClick={() => setSelected(s.id)}>
                      <span className="block font-semibold">{SECTION_LABELS[s.type]}</span>
                      {"title" in s && s.title && <span className="block truncate text-xs text-muted">{s.title}</span>}
                    </button>
                    <button type="button" className="px-2 py-2 text-muted hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter">↑</button>
                    <button type="button" className="px-2 py-2 pr-3 text-muted hover:text-ink disabled:opacity-30" disabled={i === theme.sections.length - 1} onClick={() => move(i, 1)} aria-label="Descendre">↓</button>
                  </li>
                ))}
              </ul>
              <div>
                <span className="eyebrow">Ajouter une section</span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(Object.keys(SECTION_LABELS) as SectionType[]).map((t) => (
                    <button key={t} type="button" className="btn btn-sm" onClick={() => { const s = blankSection(t); setTheme((th) => ({ ...th, sections: [...th.sections, s] })); setSelected(s.id); }}>
                      + {SECTION_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line p-4">
          <span className="text-xs text-muted">{error ? <span className="font-semibold text-red-700">{error}</span> : dirty ? "Modifications non enregistrées" : "Tout est enregistré"}</span>
          <div className="flex gap-2">
            {dirty && <button type="button" className="btn btn-sm" onClick={() => setTheme(JSON.parse(saved))}>Annuler</button>}
            <button type="button" className="btn btn-primary btn-sm" disabled={!dirty || pending} onClick={save}>{pending ? "Publication…" : "Publier"}</button>
          </div>
        </div>
      </aside>

      <div className="card min-w-0 overflow-hidden">
        <div className="flex items-center gap-1.5 border-b border-line bg-[#F6F8F7] px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#E4A3A3]" /><span className="h-2.5 w-2.5 rounded-full bg-[#E9CF8E]" /><span className="h-2.5 w-2.5 rounded-full bg-[#9FCDB0]" />
          <span className="ml-3 truncate text-xs text-muted">/s/{store.slug}</span>
          <span className="ml-auto text-xs text-muted">Aperçu : les liens sont désactivés</span>
        </div>
        <div
          style={themeVars(theme) as React.CSSProperties}
          className={`${storeFontVars} max-h-[calc(100vh-120px)] overflow-y-auto bg-[var(--c-bg)] font-[family-name:var(--t-body)] text-[var(--c-text)]`}
          onClickCapture={(e) => {
            const a = (e.target as HTMLElement).closest("a");
            if (a) e.preventDefault();
            const sec = (e.target as HTMLElement).closest<HTMLElement>("[data-section]");
            if (sec) { setSelected(sec.dataset.section!); setTab("sections"); }
          }}
        >
          {theme.announcement && <div className="bg-[var(--c-accent)] px-4 py-2 text-center text-sm font-medium text-[var(--c-accent-text)]">{theme.announcement}</div>}
          <div className="border-b border-[color-mix(in_srgb,var(--c-text)_12%,transparent)]">
            <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-4">
              <span className="mr-auto font-[family-name:var(--t-display)] text-xl font-semibold md:text-2xl">{store.name}</span>
              <span className="hidden text-sm md:inline">Tous les produits</span>
              <span className="text-sm font-medium">Panier</span>
            </div>
          </div>
          <Sections sections={theme.sections} products={products} collections={collections} store={store} selectedId={selected} />
        </div>
      </div>
    </div>
  );
}

function SectionFields({ s, collections, onChange }: { s: Section; collections: CardCollection[]; onChange: (p: Partial<Section>) => void }) {
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
  }
}
