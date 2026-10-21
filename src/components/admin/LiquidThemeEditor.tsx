"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { publish, saveLiquidFiles } from "@/app/admin/theme/actions";
import type { EDITABLE_TEMPLATES, SchemaSetting, SectionSchema, TemplateJson } from "@/lib/liquid/editor-data";
import { schemaLabel } from "@/lib/liquid/schema-label";
import { cx } from "@/lib/utils";
import { ImageField } from "./ImageField";
import { MenuPopover } from "./MenuPopover";
import { I } from "./ThemeEditor";

type Pick = { handle: string; title: string };
type Props = {
  themeId: string; name: string; published: boolean; slug: string;
  data: { sections: Record<string, SectionSchema>; groups: Record<string, TemplateJson>; templates: Record<string, TemplateJson>; schema: ({ name: string; settings?: SchemaSetting[] } & Record<string, unknown>)[]; settings: Record<string, unknown>; settingsData: { current?: string | Record<string, unknown>; presets?: Record<string, Record<string, unknown>> }; labels: Record<string, string> };
  templates: typeof EDITABLE_TEMPLATES extends (infer T)[] ? Omit<T, "preview">[] : never;
  previews: Record<string, string>;
  pickers: { products: Pick[]; collections: Pick[]; pages: Pick[]; blogs: Pick[]; menus: Pick[] };
};
type Panel = { kind: "sections" } | { kind: "settings" } | { kind: "add"; group: string | null; index: number };
type Inspector = { group: string | null; id: string; blockId?: string } | null;
const DEVICES = { desktop: { label: "Ordinateur", width: "100%" }, tablet: { label: "Tablette", width: "768px" }, mobile: { label: "Mobile", width: "390px" } } as const;
type Device = keyof typeof DEVICES;
const uid = () => Math.random().toString(36).slice(2, 10);
const GROUP_NAMES: Record<string, string> = { "Header group": "Groupe d'en-tête", "Footer group": "Groupe de pied de page", "Overlay group": "Groupe de superposition", "Aside group": "Groupe latéral", "": "" };
const menuItem = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-[#f1f1f1]";
const FONTS = ["inter_n4", "dm_sans_n4", "manrope_n4", "poppins_n4", "montserrat_n4", "lato_n4", "roboto_n4", "open_sans_n4", "work_sans_n4", "nunito_n4", "raleway_n4", "playfair_display_n4", "cormorant_garamond_n4", "lora_n4", "merriweather_n4", "libre_baskerville_n4", "fraunces_n4", "syne_n4", "space_grotesk_n4", "figtree_n4", "jost_n4", "outfit_n4", "karla_n4", "rubik_n4", "archivo_n4", "oswald_n4", "josefin_sans_n4", "quicksand_n4", "barlow_n4", "din_next_n4", "futura_n4", "helvetica_n4"];
const fontLabel = (v: string) => v.replace(/_n\d$/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
let LABELS: Record<string, string> = {};
const tr = (s?: string) => schemaLabel(LABELS, s);

/**
 * Éditeur visuel d'un thème Shopify importé, sur le modèle de l'éditeur Shopify : arborescence à gauche,
 * aperçu rendu en direct au centre (chaque modification est envoyée au moteur Liquid sans enregistrer),
 * réglages de la section ou du bloc sélectionné à droite. Survol et clic dans l'aperçu, « + » entre les sections.
 */
export function LiquidThemeEditor({ themeId, name, published, slug, data, templates, previews, pickers }: Props) {
  LABELS = data.labels;
  const [tpl, setTpl] = useState<Record<string, TemplateJson>>(() => structuredClone(data.templates));
  const [groups, setGroups] = useState<Record<string, TemplateJson>>(() => structuredClone(data.groups));
  const [settings, setSettings] = useState<Record<string, unknown>>(() => structuredClone(data.settings));
  const [saved, setSaved] = useState(() => JSON.stringify([data.templates, data.groups, data.settings]));
  const [current, setCurrent] = useState(templates[0]?.key ?? "index");
  const [panel, setPanel] = useState<Panel>({ kind: "sections" });
  const [inspector, setInspector] = useState<Inspector>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [rendering, setRendering] = useState(false);
  const [pending, start] = useTransition();
  const history = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
  const iframe = useRef<HTMLIFrameElement>(null);
  const scrollY = useRef(0);
  const state = JSON.stringify([tpl, groups, settings]);
  const dirty = state !== saved;

  const snapshot = () => { history.current.past = [...history.current.past.slice(-49), state]; history.current.future = []; };
  const restore = (s: string) => { const [t, g, st] = JSON.parse(s) as [typeof tpl, typeof groups, typeof settings]; setTpl(t); setGroups(g); setSettings(st); };
  const undo = () => { const p = history.current.past.pop(); if (!p) return; history.current.future.push(state); restore(p); };
  const redo = () => { const f = history.current.future.pop(); if (!f) return; history.current.past.push(state); restore(f); };

  /** Fichiers modifiés par rapport à la version enregistrée (ceux que l'aperçu et l'enregistrement envoient). */
  const changedFiles = useCallback(() => {
    const files: Record<string, string> = {};
    for (const [k, v] of Object.entries(tpl)) if (JSON.stringify(v) !== JSON.stringify(data.templates[k])) files[`templates/${k}.json`] = JSON.stringify(v, null, 2);
    for (const [k, v] of Object.entries(groups)) if (JSON.stringify(v) !== JSON.stringify(data.groups[k])) files[`sections/${k}.json`] = JSON.stringify(v, null, 2);
    if (JSON.stringify(settings) !== JSON.stringify(data.settings)) files["config/settings_data.json"] = JSON.stringify({ ...data.settingsData, current: { ...(typeof data.settingsData.current === "object" ? data.settingsData.current : {}), ...settings } }, null, 2);
    return files;
  }, [tpl, groups, settings, data]);

  const save = () => start(async () => {
    setError(null);
    const res = await saveLiquidFiles(themeId, changedFiles());
    if (res.error) return setError(res.error);
    Object.assign(data.templates, structuredClone(tpl)); Object.assign(data.groups, structuredClone(groups)); Object.assign(data.settings, structuredClone(settings)); data.settingsData.current = { ...(typeof data.settingsData.current === "object" ? data.settingsData.current : {}), ...settings };
    setSaved(JSON.stringify([tpl, groups, settings]));
  });

  const schemaOf = (type: string) => data.sections[type];
  const label = (type: string) => tr(schemaOf(type)?.name) || type;
  const names = useCallback(() => {
    const out: Record<string, string> = {};
    for (const d of [tpl[current], ...Object.values(groups)]) if (d) for (const [id, s] of Object.entries(d.sections)) out[id] = label(s.type);
    return out;
  }, [tpl, groups, current]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Aperçu en direct : la page est rendue par le serveur avec les fichiers en cours de modification, puis écrite dans le cadre. */
  const previewPath = previews[current] ?? "/";
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setRendering(true);
      try {
        const res = await fetch(`/s/${slug}/liquid/design-preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ themeId, path: previewPath, overrides: changedFiles(), names: names() }), signal: ctrl.signal });
        const html = await res.text();
        const doc = iframe.current?.contentDocument;
        if (!doc) return;
        doc.open(); doc.write(html); doc.close();
      } catch { /* requête annulée ou aperçu indisponible : le cadre garde la version précédente */ } finally { setRendering(false); }
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [state, previewPath, slug, themeId, changedFiles, names]);

  // Messages de l'aperçu : survol, clic sur une section ou un bloc, « + » entre les sections, position de défilement.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const m = e.data as { rv?: number; type?: string; id?: string; blockId?: string | null; after?: string; y?: number };
      if (!m?.rv || e.source !== iframe.current?.contentWindow) return;
      if (m.type === "hover") setHover(m.id ?? null);
      if (m.type === "scrolled" && typeof m.y === "number") scrollY.current = m.y;
      if (m.type === "ready") { iframe.current?.contentWindow?.postMessage({ rv: 1, type: "scroll", y: scrollY.current }, "*"); if (inspector?.id) iframe.current?.contentWindow?.postMessage({ rv: 1, type: "select", id: inspector.id, quiet: true }, "*"); }
      if (m.type === "select" && m.id) { const where = locate(m.id); if (where) { setInspector({ group: where.group, id: m.id, blockId: m.blockId ?? undefined }); setPanel({ kind: "sections" }); } }
      if (m.type === "add" && m.after) { const where = locate(m.after); if (where) setPanel({ kind: "add", group: where.group, index: where.index + 1 }); }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  });
  useEffect(() => { iframe.current?.contentWindow?.postMessage({ rv: 1, type: "select", id: inspector?.id ?? null }, "*"); }, [inspector?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { const mod = e.metaKey || e.ctrlKey; if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); } if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); if (dirty && !pending) save(); } };
    const onLeave = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("keydown", onKey); window.addEventListener("beforeunload", onLeave);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", onLeave); };
  });

  /** Document JSON (gabarit courant ou groupe) qui contient une section. */
  const doc = (group: string | null) => (group ? groups[group] : tpl[current]);
  const locate = (id: string): { group: string | null; index: number } | null => {
    if (tpl[current]?.sections[id]) return { group: null, index: tpl[current].order.indexOf(id) };
    for (const [k, g] of Object.entries(groups)) if (g.sections[id]) return { group: k, index: g.order.indexOf(id) };
    return null;
  };
  const setDoc = (group: string | null, fn: (d: TemplateJson) => TemplateJson) => {
    snapshot();
    if (group) setGroups((g) => ({ ...g, [group]: fn(g[group]) }));
    else setTpl((t) => ({ ...t, [current]: fn(t[current]) }));
  };
  const addSection = (group: string | null, index: number, type: string, preset?: NonNullable<SectionSchema["presets"]>[number]) => {
    const sc = schemaOf(type);
    const id = `${type}_${uid()}`;
    const defaults = Object.fromEntries((sc?.settings ?? []).filter((s) => s.id && s.default !== undefined).map((s) => [s.id!, s.default]));
    const blocks: NonNullable<TemplateJson["sections"][string]["blocks"]> = {};
    const order: string[] = [];
    for (const b of preset?.blocks ?? []) { const bid = `${b.type}_${uid()}`; const bs = sc?.blocks?.find((x) => x.type === b.type); blocks[bid] = { type: b.type, settings: { ...Object.fromEntries((bs?.settings ?? []).filter((s) => s.id && s.default !== undefined).map((s) => [s.id!, s.default])), ...(b.settings ?? {}) } }; order.push(bid); }
    setDoc(group, (d) => { const o = [...d.order]; o.splice(Math.min(index, o.length), 0, id); return { ...d, sections: { ...d.sections, [id]: { type, settings: { ...defaults, ...(preset?.settings ?? {}) }, ...(order.length ? { blocks, block_order: order } : {}) } }, order: o }; });
    setPanel({ kind: "sections" });
    setInspector({ group, id });
  };
  const iconBtn = (active = false) => cx("grid h-8 w-8 place-items-center rounded-lg text-[#4a4a4a] hover:bg-[#f1f1f1] disabled:opacity-30 disabled:hover:bg-transparent", active && "bg-[#e3e3e3] text-ink");
  const dragFrom = useRef<{ group: string | null; i: number } | null>(null);

  /** Ligne de l'arborescence : une section, avec ses blocs dépliés quand elle est sélectionnée. */
  const Row = ({ group, id, i }: { group: string | null; id: string; i: number }) => {
    const d = doc(group); const s = d.sections[id]; if (!s) return null;
    const sc = schemaOf(s.type);
    const active = inspector?.id === id;
    const blockOrder = s.block_order ?? Object.keys(s.blocks ?? {});
    return (
      <div>
        <div className={cx("group flex items-center gap-1 rounded-lg pr-1 hover:bg-[#f1f1f1]", (active || hover === id) && "bg-[#ebebeb]", s.disabled && "opacity-50")} draggable onDragStart={() => { dragFrom.current = { group, i }; }} onDragOver={(e) => e.preventDefault()} onDrop={() => { const f = dragFrom.current; dragFrom.current = null; if (!f || f.group !== group || f.i === i) return; setDoc(group, (dd) => { const o = [...dd.order]; const [x] = o.splice(f.i, 1); o.splice(i, 0, x); return { ...dd, order: o }; }); }}>
          <button type="button" onClick={() => setInspector(active && !inspector?.blockId ? null : { group, id })} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2 text-left text-[13px]">
            <I n="chevron" className={cx("h-3.5 w-3.5 shrink-0 text-[#8a8a8a] transition", active && "rotate-90")} /><I n="sections" className="h-4 w-4 shrink-0 text-[#4a4a4a]" />
            <span className="min-w-0 flex-1 truncate ">{label(s.type)}</span>
          </button>
          <span className="cursor-grab text-[#b5b5b5] opacity-0 group-hover:opacity-100" aria-hidden><I n="grip" className="h-4 w-4" /></span>
          <button type="button" onClick={() => setDoc(group, (dd) => ({ ...dd, sections: { ...dd.sections, [id]: { ...s, disabled: !s.disabled } } }))} className={cx("grid h-7 w-7 place-items-center rounded-md text-[#6b6b6b] hover:bg-[#e3e3e3]", !s.disabled && "opacity-0 group-hover:opacity-100")} aria-label={s.disabled ? "Afficher" : "Masquer"}><I n={s.disabled ? "eyeOff" : "eye"} className="h-4 w-4" /></button>
        </div>
        {active && sc?.blocks?.length ? (
          <div className="ml-6 border-l border-line pl-1">
            {blockOrder.map((bid) => { const b = s.blocks?.[bid]; if (!b) return null; const bs = sc.blocks!.find((x) => x.type === b.type); return (
              <div key={bid} className={cx("group flex items-center rounded-lg hover:bg-[#f1f1f1]", inspector?.blockId === bid && "bg-[#ebebeb]", b.disabled && "opacity-50")}>
                <button type="button" onClick={() => setInspector({ group, id, blockId: bid })} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left text-[13px]"><I n="text" className="h-3.5 w-3.5 text-[#8a8a8a]" /><span className="truncate ">{tr(bs?.name) || b.type}</span></button>
                <button type="button" onClick={() => setDoc(group, (dd) => ({ ...dd, sections: { ...dd.sections, [id]: { ...s, blocks: { ...s.blocks, [bid]: { ...b, disabled: !b.disabled } } } } }))} className={cx("grid h-6 w-6 place-items-center rounded-md text-[#6b6b6b] hover:bg-[#e3e3e3]", !b.disabled && "opacity-0 group-hover:opacity-100")} aria-label={b.disabled ? "Afficher" : "Masquer"}><I n={b.disabled ? "eyeOff" : "eye"} className="h-3.5 w-3.5" /></button>
              </div>
            ); })}
            {blockOrder.length < (sc.max_blocks ?? 50) && (
              <details><summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1 text-[13px] font-[550] text-[#005bd3] hover:underline"><I n="plus" className="h-3.5 w-3.5" />Ajouter un bloc</summary>
                <div className="ml-2 flex flex-col gap-0.5 rounded-lg border border-line p-1">{sc.blocks.filter((bt) => bt.type !== "@app").map((bt) => <button key={bt.type} type="button" onClick={() => { const bid = `${bt.type}_${uid()}`; setDoc(group, (dd) => ({ ...dd, sections: { ...dd.sections, [id]: { ...s, blocks: { ...s.blocks, [bid]: { type: bt.type, settings: Object.fromEntries((bt.settings ?? []).filter((x) => x.id && x.default !== undefined).map((x) => [x.id!, x.default])) } }, block_order: [...blockOrder, bid] } } })); setInspector({ group, id, blockId: bid }); }} className="rounded px-2 py-1 text-left text-[13px] hover:bg-[#f1f1f1]">{tr(bt.name) || bt.type}</button>)}</div>
              </details>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const AddLink = ({ group, index }: { group: string | null; index: number }) => (
    <button type="button" onClick={() => setPanel({ kind: "add", group, index })} className="flex items-center gap-2 px-2 py-2 text-[13px] font-[550] text-[#005bd3] hover:underline"><I n="plus" className="h-4 w-4" />Ajouter une section</button>
  );

  /** Panneau « Ajouter une section » : sections du thème autorisées ici, avec recherche (comme sur Shopify). */
  const addPanel = (group: string | null, index: number) => {
    const t = current;
    const allowed = Object.entries(data.sections).filter(([type, sc]) => {
      if (group === null && !sc.presets?.length) return false;
      if (group === null && sc.enabled_on?.templates && !sc.enabled_on.templates.includes("*") && !sc.enabled_on.templates.includes(t)) return false;
      if (sc.disabled_on?.templates?.includes("*") || sc.disabled_on?.templates?.includes(t)) return false;
      if (group && sc.enabled_on?.groups && !sc.enabled_on.groups.includes("*") && !sc.enabled_on.groups.includes(groups[group]?.type ?? "")) return false;
      if (group && sc.disabled_on?.groups?.includes(groups[group]?.type ?? "")) return false;
      if (group === null && sc.templates && !sc.templates.includes(t)) return false;
      if (group === null && (type === "header" || type === "footer")) return false;
      return !query || label(type).toLowerCase().includes(query.toLowerCase());
    }).sort((a, b) => label(a[0]).localeCompare(label(b[0])));
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-1 border-b border-line px-2 py-2"><button type="button" onClick={() => setPanel({ kind: "sections" })} className={iconBtn()} aria-label="Retour"><I n="back" /></button><span className="text-[13px] font-[650]">Ajouter une section</span></div>
        <div className="p-2"><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une section" className="input h-8 text-[13px]" aria-label="Rechercher une section" /></div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {allowed.map(([type, sc]) => (
            <div key={type}>
              <button type="button" onClick={() => addSection(group, index, type, sc.presets?.[0])} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-[#f1f1f1]"><I n="sections" className="h-4 w-4 text-[#4a4a4a]" />{label(type)}</button>
              {(sc.presets?.length ?? 0) > 1 && <div className="ml-6 flex flex-col">{sc.presets!.slice(1).map((p, i) => <button key={i} type="button" onClick={() => addSection(group, index, type, p)} className="rounded px-2 py-1 text-left text-xs text-muted hover:bg-[#f1f1f1]">{tr(p.name)}</button>)}</div>}
            </div>
          ))}
          {!allowed.length && <p className="px-2 py-6 text-center text-xs text-muted">Aucune section ne correspond.</p>}
        </div>
      </div>
    );
  };

  /** Panneau de droite : réglages de la section ou du bloc sélectionné. */
  const inspectorPanel = () => {
    if (!inspector) return null;
    const d = doc(inspector.group); const s = d?.sections[inspector.id]; if (!s) return null;
    const sc = schemaOf(s.type);
    const close = () => setInspector(null);
    if (inspector.blockId) {
      const bid = inspector.blockId; const b = s.blocks?.[bid]; const bs = sc?.blocks?.find((x) => x.type === b?.type);
      if (!b) return null;
      return (
        <aside className="flex w-[320px] shrink-0 flex-col border-l border-line bg-white">
          <div className="flex items-center gap-1 border-b border-line px-2 py-2"><button type="button" onClick={() => setInspector({ group: inspector.group, id: inspector.id })} className={iconBtn()} aria-label="Retour à la section"><I n="back" /></button><span className="min-w-0 flex-1 truncate text-[13px] font-[650] ">{tr(bs?.name) || b.type}</span><button type="button" onClick={close} className={iconBtn()} aria-label="Fermer">✕</button></div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"><SettingsForm schema={bs?.settings ?? []} values={b.settings ?? {}} pickers={pickers} schemes={schemes(settings)} onChange={(k, v) => setDoc(inspector.group, (dd) => ({ ...dd, sections: { ...dd.sections, [inspector.id]: { ...s, blocks: { ...s.blocks, [bid]: { ...b, settings: { ...b.settings, [k]: v } } } } } }))} /></div>
          <div className="flex justify-end border-t border-line p-2"><button type="button" onClick={() => { setDoc(inspector.group, (dd) => { const blocks = { ...s.blocks }; delete blocks[bid]; return { ...dd, sections: { ...dd.sections, [inspector.id]: { ...s, blocks, block_order: (s.block_order ?? Object.keys(s.blocks ?? {})).filter((x) => x !== bid) } } }; }); setInspector({ group: inspector.group, id: inspector.id }); }} className="btn h-8 gap-1.5 text-[13px] text-[#8e0b21]"><I n="trash" className="h-4 w-4" />Retirer le bloc</button></div>
        </aside>
      );
    }
    return (
      <aside className="flex w-[320px] shrink-0 flex-col border-l border-line bg-white">
        <div className="flex items-center gap-1 border-b border-line px-3 py-2"><span className="min-w-0 flex-1 truncate text-[13px] font-[650] ">{label(s.type)}</span><button type="button" onClick={close} className={iconBtn()} aria-label="Fermer">✕</button></div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          <SettingsForm schema={sc?.settings ?? []} values={s.settings ?? {}} pickers={pickers} schemes={schemes(settings)} onChange={(k, v) => setDoc(inspector.group, (dd) => ({ ...dd, sections: { ...dd.sections, [inspector.id]: { ...s, settings: { ...s.settings, [k]: v } } } }))} />
          {!sc?.settings?.length && <p className="text-[13px] text-muted">Cette section n&apos;a pas de réglages.</p>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line p-2">
          <button type="button" onClick={() => setDoc(inspector.group, (dd) => ({ ...dd, sections: { ...dd.sections, [inspector.id]: { ...s, disabled: !s.disabled } } }))} className="btn h-8 gap-1.5 text-[13px]"><I n={s.disabled ? "eye" : "eyeOff"} className="h-4 w-4" />{s.disabled ? "Afficher" : "Masquer"}</button>
          <button type="button" onClick={() => { setDoc(inspector.group, (dd) => { const sections = { ...dd.sections }; delete sections[inspector.id]; return { ...dd, sections, order: dd.order.filter((x) => x !== inspector.id) }; }); close(); }} className="btn h-8 gap-1.5 text-[13px] text-[#8e0b21]"><I n="trash" className="h-4 w-4" />Retirer la section</button>
        </div>
      </aside>
    );
  };

  const headerGroups = Object.entries(groups).filter(([, g]) => g.type === "header");
  const footerGroups = Object.entries(groups).filter(([, g]) => g.type === "footer");
  const otherGroups = Object.entries(groups).filter(([, g]) => g.type !== "header" && g.type !== "footer");
  const tplDoc = tpl[current];
  const generalSchema = data.schema.filter((g) => g.name !== "theme_info");
  const groupBlock = (k: string, g: TemplateJson, fallback: string) => (
    <div key={k} className="border-b border-line p-2">
      <div className="px-2 pb-1 pt-1 text-xs font-[650] text-[#4a4a4a]">{GROUP_NAMES[tr(g.name)] ?? tr(g.name) ?? fallback}</div>
      {g.order.map((id, i) => <Row key={id} group={k} id={id} i={i} />)}
      <AddLink group={k} index={g.order.length} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f1f1f1] text-ink">
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line bg-white px-2">
        <Link href="/admin/theme" className={iconBtn()} aria-label="Quitter l'éditeur" title="Quitter"><I n="exit" /></Link>
        <span className="mx-1 h-6 w-px bg-line" />
        <button type="button" onClick={() => setPanel({ kind: "sections" })} className={iconBtn(panel.kind !== "settings")} aria-label="Sections" title="Sections"><I n="sections" /></button>
        <button type="button" onClick={() => { setPanel({ kind: "settings" }); setInspector(null); }} className={iconBtn(panel.kind === "settings")} aria-label="Paramètres du thème" title="Paramètres du thème"><I n="settings" /></button>
        <div className="mx-auto flex min-w-0 items-center gap-4 text-[13px]">
          <span className="flex min-w-0 items-center gap-2"><span className="truncate font-[550]">{name}</span>{published ? <span className="rounded-full bg-[#cdfed4] px-2 py-0.5 text-xs font-[550] text-[#0c5132]">Actif</span> : <span className="rounded-full bg-[#e3e3e3] px-2 py-0.5 text-xs font-[550]">Brouillon</span>}</span>
          <label className="hidden items-center gap-1.5 text-[#4a4a4a] sm:flex"><I n="home" className="h-4 w-4" /><select value={current} onChange={(e) => { setCurrent(e.target.value); setInspector(null); setPanel({ kind: "sections" }); }} className="bg-transparent text-[13px] font-[550] outline-none" aria-label="Page">{templates.map((t) => <option key={t.key} value={t.key} disabled={!tpl[t.key]}>{t.label}</option>)}</select></label>
          {rendering && <span className="text-xs text-muted">Aperçu…</span>}
        </div>
        <div className="hidden items-center gap-0.5 md:flex">{(Object.keys(DEVICES) as Device[]).map((d) => <button key={d} type="button" onClick={() => setDevice(d)} className={iconBtn(device === d)} aria-label={DEVICES[d].label} title={DEVICES[d].label}><I n={d} /></button>)}</div>
        <span className="mx-1 hidden h-6 w-px bg-line md:block" />
        <button type="button" onClick={undo} disabled={!history.current.past.length} className={iconBtn()} aria-label="Annuler" title="Annuler (⌘Z)"><I n="undo" /></button>
        <button type="button" onClick={redo} disabled={!history.current.future.length} className={iconBtn()} aria-label="Rétablir" title="Rétablir (⇧⌘Z)"><I n="redo" /></button>
        <MenuPopover label="Plus d'actions" buttonClassName={iconBtn()}>
          <a href={`/s/${slug}/preview?theme=${themeId}`} target="_blank" className={menuItem}>Aperçu dans un nouvel onglet</a>
          <Link href={`/admin/theme/${themeId}/code`} className={menuItem}>Modifier le code</Link>
          <Link href="/admin/theme" className={menuItem}>Bibliothèque de thèmes</Link>
        </MenuPopover>
        {!published && (
          <form action={publish} onSubmit={(e) => { if (dirty) { e.preventDefault(); setError("Enregistrez vos modifications avant de publier."); } else if (!confirm(`Publier « ${name} » ? La boutique en ligne changera immédiatement.`)) e.preventDefault(); }}><input type="hidden" name="id" value={themeId} /><button className="btn h-8 text-[13px]">Publier</button></form>
        )}
        <button type="button" onClick={save} disabled={!dirty || pending} className="btn btn-primary ml-1 h-8 text-[13px]">{pending ? "Enregistrement…" : "Enregistrer"}</button>
      </header>
      {error && <p role="alert" className="border-b border-[#fedad9] bg-[#fff4f4] px-4 py-2 text-[13px] text-[#8e0b21]">{error}</p>}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[300px] shrink-0 flex-col border-r border-line bg-white">
          {panel.kind === "settings" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="border-b border-line px-4 py-3 text-[13px] font-[650]">Paramètres du thème</div>
              {generalSchema.map((g, i) => (
                <details key={i} className="border-b border-line" open={i === 0}>
                  <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-[600]">{tr(String(g.name))}</summary>
                  <div className="flex flex-col gap-3 px-3 pb-4"><SettingsForm schema={g.settings ?? []} values={settings} pickers={pickers} schemes={schemes(settings)} onChange={(k, v) => { snapshot(); setSettings((s) => ({ ...s, [k]: v })); }} /></div>
                </details>
              ))}
            </div>
          ) : panel.kind === "add" ? addPanel(panel.group, panel.index) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="border-b border-line px-4 py-3 text-[13px] font-[650]">{templates.find((t) => t.key === current)?.label}</div>
              {headerGroups.map(([k, g]) => groupBlock(k, g, "Groupe d'en-tête"))}
              <div className="border-b border-line p-2">
                <div className="px-2 pb-1 pt-1 text-xs font-[650] text-[#4a4a4a]">Modèle</div>
                {tplDoc ? tplDoc.order.map((id, i) => <Row key={id} group={null} id={id} i={i} />) : <p className="px-2 py-2 text-xs text-muted">Ce gabarit n&apos;est pas au format JSON : modifiez-le dans « Modifier le code ».</p>}
                {tplDoc && <AddLink group={null} index={tplDoc.order.length} />}
              </div>
              {otherGroups.map(([k, g]) => groupBlock(k, g, k))}
              {footerGroups.map(([k, g]) => groupBlock(k, g, "Groupe de pied de page"))}
            </div>
          )}
        </aside>
        <main className="flex min-w-0 flex-1 justify-center overflow-hidden p-3">
          <div className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-white shadow-sm transition-[width]" style={{ width: DEVICES[device].width, maxWidth: "100%" }}>
            <iframe ref={iframe} title="Aperçu" className="min-h-0 w-full flex-1 bg-white" />
          </div>
        </main>
        {inspectorPanel()}
      </div>
    </div>
  );
}

const schemes = (settings: Record<string, unknown>) => Object.keys((settings.color_schemes as Record<string, unknown> | undefined) ?? {});

/** Formulaire généré depuis un schéma Shopify (settings d'une section, d'un bloc ou du thème). */
function SettingsForm({ schema, values, onChange, pickers, schemes }: { schema: SchemaSetting[]; values: Record<string, unknown>; onChange: (key: string, value: unknown) => void; pickers: Props["pickers"]; schemes: string[] }) {
  const t = (s?: string) => schemaLabel(LABELS, s);
  return (
    <>
      {schema.map((s, i) => {
        if (s.type === "header") return <div key={i} className="mt-2 text-xs font-[650] uppercase tracking-wide text-[#4a4a4a] first:mt-0">{t(s.content ?? s.label)}</div>;
        if (s.type === "paragraph") return <p key={i} className="text-xs text-muted">{t(s.content)}</p>;
        if (!s.id) return null;
        const v = values[s.id] ?? s.default;
        const set = (x: unknown) => onChange(s.id!, x);
        const lab = <span className="">{t(s.label) || s.id}</span>;
        const field = (() => {
          switch (s.type) {
            case "checkbox": return <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={Boolean(v)} onChange={(e) => set(e.target.checked)} className="h-4 w-4 accent-[#7c3aed]" />{lab}</label>;
            case "range": return <label className="label">{lab} <span className="num text-xs text-muted">{String(v ?? s.min ?? 0)}{s.unit ?? ""}</span><input type="range" min={s.min ?? 0} max={s.max ?? 100} step={s.step ?? 1} value={Number(v ?? s.min ?? 0)} onChange={(e) => set(Number(e.target.value))} className="w-full accent-[#7c3aed]" /></label>;
            case "number": return <label className="label">{lab}<input type="number" value={v === undefined || v === null ? "" : String(v)} onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))} className="input" /></label>;
            case "select": case "radio": case "text_alignment": return <label className="label">{lab}<select value={String(v ?? "")} onChange={(e) => set(e.target.value)} className="input">{(s.options ?? (s.type === "text_alignment" ? [{ value: "left", label: "Gauche" }, { value: "center", label: "Centre" }, { value: "right", label: "Droite" }] : [])).map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}</select></label>;
            case "color": case "color_background": return <label className="flex items-center justify-between gap-2 text-[13px]">{lab}<span className="flex items-center gap-1.5"><input type="color" value={/^#[0-9a-f]{6}$/i.test(String(v ?? "")) ? String(v) : "#000000"} onChange={(e) => set(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-line bg-white p-0.5" /><input value={String(v ?? "")} onChange={(e) => set(e.target.value)} className="input h-8 w-24 font-mono text-xs" /></span></label>;
            case "color_scheme": return <label className="label">{lab}<select value={String(v ?? "")} onChange={(e) => set(e.target.value)} className="input">{schemes.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>;
            case "font_picker": return <label className="label">{lab}<select value={String(v ?? "")} onChange={(e) => set(e.target.value)} className="input">{[...new Set([String(v ?? ""), ...FONTS])].filter(Boolean).map((f) => <option key={f} value={f}>{fontLabel(f)}</option>)}</select></label>;
            case "image_picker": return <ImageField id={`set-${s.id}`} label={t(s.label) || s.id} value={typeof v === "string" && /^(https?:)?\//.test(v) ? v : null} onChange={(url) => set(url ?? "")} />;
            case "textarea": case "richtext": case "inline_richtext": case "html": case "liquid": return <label className="label">{lab}<textarea value={String(v ?? "")} onChange={(e) => set(e.target.value)} className="input min-h-[80px]" /></label>;
            case "product": return <label className="label">{lab}<select value={String(v ?? "")} onChange={(e) => set(e.target.value)} className="input"><option value="">—</option>{pickers.products.map((p) => <option key={p.handle} value={p.handle}>{p.title}</option>)}</select></label>;
            case "collection": return <label className="label">{lab}<select value={String(v ?? "")} onChange={(e) => set(e.target.value)} className="input"><option value="">—</option>{pickers.collections.map((p) => <option key={p.handle} value={p.handle}>{p.title}</option>)}</select></label>;
            case "page": return <label className="label">{lab}<select value={String(v ?? "")} onChange={(e) => set(e.target.value)} className="input"><option value="">—</option>{pickers.pages.map((p) => <option key={p.handle} value={p.handle}>{p.title}</option>)}</select></label>;
            case "blog": return <label className="label">{lab}<select value={String(v ?? "")} onChange={(e) => set(e.target.value)} className="input"><option value="">—</option>{pickers.blogs.map((p) => <option key={p.handle} value={p.handle}>{p.title}</option>)}</select></label>;
            case "link_list": return <label className="label">{lab}<select value={String(v ?? "")} onChange={(e) => set(e.target.value)} className="input"><option value="">—</option>{pickers.menus.map((p) => <option key={p.handle} value={p.handle}>{p.title}</option>)}</select></label>;
            case "product_list": case "collection_list": { const list = s.type === "product_list" ? pickers.products : pickers.collections; const cur = Array.isArray(v) ? (v as string[]) : []; return <fieldset><legend className="mb-1 text-[13px] ">{t(s.label)}</legend><div className="max-h-40 overflow-y-auto rounded-lg border border-line p-2">{list.map((p) => <label key={p.handle} className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={cur.includes(p.handle)} onChange={(e) => set(e.target.checked ? [...cur, p.handle].slice(0, s.limit ?? 50) : cur.filter((x) => x !== p.handle))} className="h-4 w-4 accent-[#7c3aed]" />{p.title}</label>)}</div></fieldset>; }
            case "url": case "video_url": case "text": return <label className="label">{lab}<input value={String(v ?? "")} onChange={(e) => set(e.target.value)} placeholder={t(s.placeholder)} className="input" /></label>;
            case "article": case "video": case "metaobject": case "metaobject_list": case "color_scheme_group": case "style.layout_panel": case "style.size_panel": case "style.spacing_panel": return <p className="text-xs text-muted">{t(s.label)} : réglage géré dans « Modifier le code ».</p>;
            default: return <label className="label">{lab}<input value={typeof v === "object" ? JSON.stringify(v) : String(v ?? "")} onChange={(e) => set(e.target.value)} className="input" /></label>;
          }
        })();
        return <div key={s.id} className="flex flex-col gap-1">{field}{s.info && <span className="text-[11px] text-muted">{t(s.info)}</span>}</div>;
      })}
    </>
  );
}
