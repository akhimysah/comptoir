/**
 * Lecture des schémas de thème : config/settings_schema.json, config/settings_data.json et le bloc
 * {% schema %} des sections. Convertit aussi les valeurs brutes des réglages en objets Liquid
 * (couleurs, polices, images, produits…) selon le type déclaré dans le schéma.
 */
import { Drop } from "liquidjs";
import { handleIndexed, toColorDrop } from "./drops";
import { FontDrop, parseFontHandle } from "./fonts";
import type { ThemeSource } from "./types";

export type SettingDef = { type: string; id?: string; default?: unknown; definition?: SettingDef[]; [k: string]: unknown };
export type SectionSchema = {
  name?: string; tag?: string; class?: string; limit?: number; max_blocks?: number;
  settings?: SettingDef[]; blocks?: Array<{ type: string; name?: string; settings?: SettingDef[]; limit?: number }>;
  presets?: Array<{ name?: string; settings?: Record<string, unknown>; blocks?: Array<{ type: string; settings?: Record<string, unknown>; blocks?: unknown[] }> }>;
  default?: { settings?: Record<string, unknown>; blocks?: Array<{ type: string; settings?: Record<string, unknown> }> };
  enabled_on?: unknown; disabled_on?: unknown; locales?: Record<string, Record<string, unknown>>;
  [k: string]: unknown;
};

/* ------------------------------------------------------------------ JSON tolérant */

/** JSON.parse tolérant : BOM, commentaires (bloc et ligne), virgules finales (fréquents dans les thèmes). */
export function parseJsonLenient<T = unknown>(text: string | null | undefined): T | null {
  if (!text) return null;
  const clean = text.replace(/^﻿/, "");
  try {
    return JSON.parse(clean) as T;
  } catch {
    /* on tente une version nettoyée */
  }
  const stripped = clean
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,(\s*[}\]])/g, "$1");
  try {
    return JSON.parse(stripped) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ Blocs bruts des fichiers Liquid */

export type Prepared = { body: string; schema: string | null; stylesheets: string[]; javascripts: string[] };

const RAW_TAGS = ["schema", "stylesheet", "javascript", "doc", "comment", "raw"] as const;
const OPEN = new RegExp(`\\{%-?\\s*(${RAW_TAGS.join("|")})\\b[^%]*?-?%\\}`, "g");

/**
 * Extrait {% schema %}, {% stylesheet %}, {% javascript %} et {% doc %} avant l'analyse Liquid : leur contenu
 * n'est pas du Liquid (JSON, CSS, JS) et ferait échouer le tokenizer. Les blocs comment/raw sont laissés intacts
 * (mais traversés, pour ne pas extraire un schéma commenté).
 */
export function prepareSource(text: string): Prepared {
  const out: Prepared = { body: "", schema: null, stylesheets: [], javascripts: [] };
  text = stripLiquidTagComments(text);
  let last = 0;
  OPEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OPEN.exec(text))) {
    const name = m[1];
    const close = new RegExp(`\\{%-?\\s*end${name}\\s*-?%\\}`, "g");
    close.lastIndex = m.index + m[0].length;
    const c = close.exec(text);
    if (!c) break;
    const inner = text.slice(m.index + m[0].length, c.index);
    const end = c.index + c[0].length;
    if (name === "comment" || name === "raw") {
      OPEN.lastIndex = end;
      continue;
    }
    out.body += text.slice(last, m.index);
    if (name === "schema") out.schema = inner;
    else if (name === "stylesheet") out.body += `{% __stylesheet ${out.stylesheets.push(inner) - 1} %}`;
    else if (name === "javascript") out.body += `{% __javascript ${out.javascripts.push(inner) - 1} %}`;
    last = end;
    OPEN.lastIndex = end;
  }
  out.body += text.slice(last);
  return out;
}

/**
 * Dans un bloc {% liquid %}, Shopify accepte `comment` … `endcomment` sur plusieurs lignes de texte libre ;
 * liquidjs lirait chaque ligne comme un tag. On retire ces lignes avant l'analyse.
 */
function stripLiquidTagComments(text: string): string {
  return text.replace(/\{%-?\s*liquid\b[\s\S]*?%\}/g, (block) => block.replace(/^[ \t]*comment[ \t]*\r?\n[\s\S]*?^[ \t]*endcomment[ \t]*$/gm, ""));
}

/* ------------------------------------------------------------------ Fichiers de configuration */

export type SettingsData = { current: Record<string, unknown>; presets: Record<string, Record<string, unknown>> };

export async function readSettingsSchema(source: ThemeSource): Promise<Array<{ name?: string; settings?: SettingDef[]; [k: string]: unknown }>> {
  const json = parseJsonLenient<unknown>(await source.get("config/settings_schema.json"));
  return Array.isArray(json) ? (json as Array<{ name?: string; settings?: SettingDef[] }>) : [];
}

/** settings_data.json : `current` peut être le nom d'un preset (thème fraîchement installé). */
export async function readSettingsData(source: ThemeSource): Promise<SettingsData> {
  const json = parseJsonLenient<{ current?: unknown; presets?: Record<string, Record<string, unknown>> }>(await source.get("config/settings_data.json"));
  const presets = json?.presets ?? {};
  let current: Record<string, unknown> = {};
  if (typeof json?.current === "string") current = presets[json.current] ?? Object.values(presets)[0] ?? {};
  else if (json?.current && typeof json.current === "object") current = json.current as Record<string, unknown>;
  return { current, presets };
}

/** Tous les réglages (avec id) déclarés dans settings_schema.json, à plat. */
export function flattenSchemaSettings(schema: Array<{ settings?: SettingDef[] }>): SettingDef[] {
  return schema.flatMap((group) => group.settings ?? []).filter((s) => !!s.id);
}

/** Valeurs par défaut d'une liste de réglages (les types sans valeur — header, paragraph — sont ignorés). */
export function defaultsOf(defs: SettingDef[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const d of defs ?? []) {
    if (!d.id || d.type === "header" || d.type === "paragraph") continue;
    if (d.default !== undefined) out[d.id] = d.default;
    else if (d.type === "checkbox") out[d.id] = false;
    else if (d.type === "range" || d.type === "number") out[d.id] = d.type === "range" ? (d.min as number | undefined) ?? 0 : null;
    else if (d.type === "color_scheme_group") out[d.id] = {};
    else if (["product_list", "collection_list", "metaobject_list"].includes(d.type)) out[d.id] = [];
    else out[d.id] = null;
  }
  return out;
}

/* ------------------------------------------------------------------ Schéma de section */

export function parseSectionSchema(schemaText: string | null): SectionSchema | null {
  const json = parseJsonLenient<SectionSchema>(schemaText);
  return json && typeof json === "object" ? json : null;
}

/* ------------------------------------------------------------------ Jeux de couleurs */

/** Jeu de couleurs (`color_scheme`) : s'affiche comme son id, expose `.settings.<clé>` (couleurs). */
export class SchemeDrop extends Drop {
  readonly id: string;
  readonly handle: string;
  readonly settings: Record<string, unknown>;
  constructor(id: string, settings: Record<string, unknown>) {
    super();
    this.id = id;
    this.handle = id;
    this.settings = settings;
  }
  get size() { return this.id.length; }
  toString() { return this.id; }
  valueOf() { return this.id; }
  toJSON() { return { id: this.id, settings: this.settings }; }
}

/** Construit les jeux de couleurs d'un réglage `color_scheme_group` à partir de settings_data (`{ "scheme-1": { settings } }`). */
export function buildSchemes(def: SettingDef, raw: unknown): SchemeDrop[] {
  const defs = def.definition ?? [];
  const entries = raw && typeof raw === "object" ? Object.entries(raw as Record<string, { settings?: Record<string, unknown> }>) : [];
  const list = entries.map(([id, v]) => new SchemeDrop(id, materialize(defs, { ...defaultsOf(defs), ...(v?.settings ?? {}) }, NO_RESOLVER)));
  if (!list.length) list.push(new SchemeDrop("scheme-1", materialize(defs, defaultsOf(defs), NO_RESOLVER)));
  return handleIndexed(list);
}

/* ------------------------------------------------------------------ Conversion typée des réglages */

/** Accès aux données de la boutique pour résoudre les réglages produit/collection/page/menu/image. */
export type Resolver = {
  product?(handle: string): unknown;
  collection?(handle: string): unknown;
  page?(handle: string): unknown;
  blog?(handle: string): unknown;
  article?(handle: string): unknown;
  linklist?(handle: string): unknown;
  image?(ref: string): unknown;
  scheme?(id: string): unknown;
  /** Signale une police utilisée (pour la balise <link> Google Fonts). */
  font?(font: FontDrop): void;
  /** Racine de la boutique pour les adresses shopify://. */
  root?: string;
};
export const NO_RESOLVER: Resolver = {};

const videoUrl = (url: string) => {
  const yt = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/.exec(url);
  if (yt) return { type: "youtube", id: yt[1], url };
  const vm = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
  if (vm) return { type: "vimeo", id: vm[1], url };
  return null;
};

/** Adresse « shopify://collections/all » → adresse de la boutique (préfixée par la racine). */
export function shopifyUrl(value: string, root: string): string {
  const m = /^shopify:\/\/(.*)$/.exec(value);
  if (!m) return value;
  return `${root.replace(/\/+$/, "")}/${m[1].replace(/^\/+/, "")}`;
}

/** Convertit une valeur brute selon le type du réglage. Les valeurs inconnues restent telles quelles. */
export function convertSetting(def: SettingDef | undefined, value: unknown, r: Resolver): unknown {
  const type = def?.type;
  if (value instanceof Drop) return value;
  switch (type) {
    case "color": {
      if (value == null || value === "") return null;
      return toColorDrop(value) ?? value;
    }
    case "font_picker": {
      const font = parseFontHandle(value) ?? parseFontHandle(def?.default) ?? parseFontHandle("inter_n4");
      if (font) r.font?.(font);
      return font;
    }
    case "image_picker": {
      if (typeof value !== "string" || !value) return null;
      return r.image?.(value.replace(/^shopify:\/\/shop_images\//, "")) ?? null;
    }
    case "video": return null;
    case "video_url": return typeof value === "string" && value ? videoUrl(value) : null;
    case "product": return typeof value === "string" && value ? r.product?.(value) ?? null : null;
    case "collection": return typeof value === "string" && value ? r.collection?.(value) ?? null : null;
    case "page": return typeof value === "string" && value ? r.page?.(value) ?? null : null;
    case "blog": return typeof value === "string" && value ? r.blog?.(value) ?? null : null;
    case "article": return typeof value === "string" && value ? r.article?.(value) ?? null : null;
    case "link_list": return typeof value === "string" && value ? r.linklist?.(value) ?? null : null;
    case "product_list": return Array.isArray(value) ? value.map((h) => r.product?.(String(h))).filter(Boolean) : [];
    case "collection_list": return Array.isArray(value) ? value.map((h) => r.collection?.(String(h))).filter(Boolean) : [];
    case "metaobject": return null;
    case "metaobject_list": return [];
    case "color_scheme": return typeof value === "string" && value ? r.scheme?.(value) ?? value : value;
    case "color_scheme_group": return value;
    case "range":
    case "number": return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value)) ? Number(value) : value;
    case "checkbox": return value === true || value === "true";
    case "url": return value == null || value === "" ? null : typeof value === "string" ? shopifyUrl(value, r.root ?? "/") : value;
    default: {
      // Sans schéma, on devine : "#aabbcc" → couleur, "inter_n4" → police, "shopify://shop_images/x" → image.
      if (typeof value === "string") {
        if (/^#[0-9a-f]{3,8}$/i.test(value)) return toColorDrop(value) ?? value;
        if (/^shopify:\/\/shop_images\//.test(value)) return r.image?.(value.replace(/^shopify:\/\/shop_images\//, "")) ?? null;
        if (/^shopify:\/\//.test(value)) return shopifyUrl(value, r.root ?? "/");
      }
      return value;
    }
  }
}

/** Applique `convertSetting` à chaque réglage ; les clés absentes du schéma sont converties par heuristique. */
export function materialize(defs: SettingDef[] | undefined, values: Record<string, unknown>, r: Resolver): Record<string, unknown> {
  const byId = new Map((defs ?? []).filter((d) => d.id).map((d) => [d.id as string, d]));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) out[k] = convertSetting(byId.get(k), v, r);
  return out;
}

/** Type d'un réglage `liquid` (rendu par le moteur avant utilisation). */
export function liquidSettingIds(defs: SettingDef[] | undefined): string[] {
  return (defs ?? []).filter((d) => d.type === "liquid" && d.id).map((d) => d.id as string);
}
