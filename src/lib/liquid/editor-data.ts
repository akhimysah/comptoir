import "server-only";
import { db } from "../db";

/** Réglage d'un schéma Shopify (settings_schema.json ou {% schema %} d'une section). */
export type SchemaSetting = { type: string; id?: string; label?: string; default?: unknown; info?: string; options?: { value: string; label: string }[]; min?: number; max?: number; step?: number; unit?: string; placeholder?: string; content?: string; limit?: number };
export type SectionSchema = { name?: string; tag?: string; class?: string; limit?: number; settings?: SchemaSetting[]; blocks?: { type: string; name?: string; limit?: number; settings?: SchemaSetting[] }[]; max_blocks?: number; presets?: { name: string; settings?: Record<string, unknown>; blocks?: { type: string; settings?: Record<string, unknown> }[] }[]; enabled_on?: { templates?: string[]; groups?: string[] }; disabled_on?: { templates?: string[]; groups?: string[] }; templates?: string[] };
export type TemplateJson = { sections: Record<string, { type: string; settings?: Record<string, unknown>; blocks?: Record<string, { type: string; settings?: Record<string, unknown>; disabled?: boolean }>; block_order?: string[]; disabled?: boolean }>; order: string[]; name?: string; type?: string; layout?: string | false; wrapper?: string };

/** Gabarits éditables, avec leur libellé et la page d'aperçu correspondante. */
export const EDITABLE_TEMPLATES: { key: string; label: string; preview: (sample: { product?: string; collection?: string; page?: string; article?: string }) => string }[] = [
  { key: "index", label: "Page d'accueil", preview: () => "/" },
  { key: "product", label: "Produits", preview: (s) => (s.product ? `/products/${s.product}` : "/") },
  { key: "collection", label: "Collections", preview: (s) => (s.collection ? `/collections/${s.collection}` : "/collections/all") },
  { key: "list-collections", label: "Liste des collections", preview: () => "/collections" },
  { key: "cart", label: "Panier", preview: () => "/cart" },
  { key: "search", label: "Recherche", preview: () => "/search?q=a" },
  { key: "page", label: "Pages", preview: (s) => (s.page ? `/pages/${s.page}` : "/") },
  { key: "blog", label: "Blog", preview: () => "/blogs/news" },
  { key: "article", label: "Articles de blog", preview: (s) => (s.article ? `/blogs/news/${s.article}` : "/blogs/news") },
  { key: "404", label: "Page 404", preview: () => "/introuvable-404" },
  { key: "password", label: "Mot de passe", preview: () => "/password" },
];

const parseJson = <T,>(s: string | null | undefined, fallback: T): T => { try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; } };

/** Schéma d'une section d'après son bloc {% schema %}. */
export function readSectionSchema(liquid: string): SectionSchema | null {
  const m = liquid.match(/{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/);
  return m ? parseJson<SectionSchema | null>(m[1], null) : null;
}

/** Tout ce dont l'éditeur visuel a besoin pour un thème Shopify. */
export async function liquidEditorData(themeId: string) {
  const files = await db.themeFile.findMany({ where: { themeId, OR: [{ path: { startsWith: "sections/" } }, { path: { startsWith: "templates/" } }, { path: { startsWith: "config/" } }] }, select: { path: true, text: true } });
  const text = (p: string) => files.find((f) => f.path === p)?.text ?? null;
  const sections: Record<string, SectionSchema> = {};
  const groups: Record<string, TemplateJson> = {};
  for (const f of files) {
    if (f.path.startsWith("sections/") && f.path.endsWith(".liquid")) { const sc = readSectionSchema(f.text ?? ""); if (sc) sections[f.path.slice(9, -7)] = sc; }
    if (f.path.startsWith("sections/") && f.path.endsWith(".json")) { const g = parseJson<TemplateJson | null>(f.text, null); if (g?.sections) groups[f.path.slice(9, -5)] = g; }
  }
  const templates: Record<string, TemplateJson> = {};
  for (const t of EDITABLE_TEMPLATES) { const j = parseJson<TemplateJson | null>(text(`templates/${t.key}.json`), null); if (j?.sections) templates[t.key] = j; }
  const schema = parseJson<({ name: string; settings?: SchemaSetting[] } & Record<string, unknown>)[]>(text("config/settings_schema.json"), []);
  const data = parseJson<{ current?: string | Record<string, unknown>; presets?: Record<string, Record<string, unknown>> }>(text("config/settings_data.json"), {});
  const current = typeof data.current === "string" ? data.presets?.[data.current] ?? {} : data.current ?? {};
  return { sections, groups, templates, schema, settings: current, settingsData: data };
}
