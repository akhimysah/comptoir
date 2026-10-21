/**
 * Moteur de rendu des thèmes Shopify (Liquid) : layout + gabarit JSON/Liquid + sections + groupes de sections.
 * Repose sur liquidjs, complété par les tags et filtres Shopify (tags.ts, filters.ts) et les objets « drops ».
 *
 * Principes : une erreur de gabarit ne fait jamais échouer la page (message inline « Liquid error (…) » comme
 * Shopify, section fautive remplacée par un commentaire) ; les gabarits analysés sont mis en cache par thème
 * (ThemeSource.id + version) ; chaque rendu a son propre état (feuilles de style collectées, polices…).
 */
import { Context, Liquid, toPromise, type Emitter, type Template } from "liquidjs";
import { allCollection, assetImage, caseInsensitive, handleIndexed, TemplateDrop, toStr } from "./drops";
import { registerFilters } from "./filters";
import {
  buildSchemes, defaultsOf, flattenSchemaSettings, liquidSettingIds, materialize, parseJsonLenient, parseSectionSchema, prepareSource, readSettingsData, readSettingsSchema,
  SchemeDrop, type Resolver, type SectionSchema, type SettingDef,
} from "./schema";
import { RenderState, RS, type BlockInstance, type EngineApi, type Loaded, type SectionInstance } from "./state";
import { lineOf, liquidErrorMessage, registerTags } from "./tags";
import { loadTranslations, type Dict } from "./translations";
import type { PageData, RenderResult, ShopifyProduct, ThemeSource } from "./types";

/* ------------------------------------------------------------------ Cache LRU */

class LRU<K, V> {
  private map = new Map<K, V>();
  constructor(private readonly max: number) {}
  get(key: K): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }
  set(key: K, value: V) {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value as K);
  }
  delete(key: K) {
    this.map.delete(key);
  }
}

/* ------------------------------------------------------------------ Moteur par thème */

type JsonTemplate = { sections?: Record<string, SectionInstance>; order?: string[]; layout?: string | false; wrapper?: string };
type ThemeConfig = { schemaFlat: SettingDef[]; current: Record<string, unknown>; themeName: string };

class Engine implements EngineApi {
  readonly liquid: Liquid;
  /** Source courante : un même thème (id+version) peut être présenté par plusieurs objets ThemeSource. */
  source!: ThemeSource;
  private readonly files = new LRU<string, Promise<Loaded | null>>(200);
  private readonly locales = new Map<string, Promise<Dict>>();
  private config: Promise<ThemeConfig> | null = null;

  constructor(locale: string) {
    const self = this;
    this.liquid = new Liquid({
      strictVariables: false, strictFilters: false, lenientIf: true, jekyllInclude: false, ownPropertyOnly: false, relativeReference: false, cache: false,
      timezoneOffset: 0, locale, extname: ".liquid", root: "snippets", partials: "snippets", layouts: "layout", dynamicPartials: true,
      fs: {
        exists: async (p) => (await self.source.get(p)) != null,
        existsSync: () => false,
        readFile: async (p) => (await self.source.get(p)) ?? "",
        readFileSync: () => "",
        resolve: (dir, file, ext) => `${dir}/${file}${file.endsWith(ext) ? "" : ext}`,
        sep: "/",
        dirname: (f) => f.split("/").slice(0, -1).join("/"),
      },
    });
    registerFilters(this.liquid);
    registerTags(this.liquid);
    patchRenderer(this.liquid);
  }

  /** Charge, prépare et analyse un fichier Liquid (null s'il n'existe pas ; lève une erreur de syntaxe). */
  load(path: string): Promise<Loaded | null> {
    const cached = this.files.get(path);
    if (cached) return cached;
    const task = (async () => {
      const text = await this.source.get(path);
      if (text == null) return null;
      const prepared = prepareSource(text);
      const templates = this.liquid.parse(prepared.body, path);
      return { templates, schema: parseSectionSchema(prepared.schema), schemaText: prepared.schema, stylesheets: prepared.stylesheets, javascripts: prepared.javascripts };
    })();
    this.files.set(path, task);
    task.catch(() => this.files.delete(path));
    return task;
  }

  translations(locale: string): Promise<Dict> {
    let t = this.locales.get(locale);
    if (!t) {
      t = loadTranslations(this.source, locale);
      this.locales.set(locale, t);
    }
    return t;
  }

  themeConfig(): Promise<ThemeConfig> {
    if (!this.config) {
      this.config = (async () => {
        const schema = await readSettingsSchema(this.source);
        const data = await readSettingsData(this.source);
        const info = schema.find((g) => g.name === "theme_info") as { theme_name?: string } | undefined;
        return { schemaFlat: flattenSchemaSettings(schema), current: data.current, themeName: info?.theme_name ?? "Theme" };
      })();
      this.config.catch(() => (this.config = null));
    }
    return this.config;
  }

  /** Rend une chaîne Liquid (réglages de type `liquid`) dans un contexte donné. */
  async renderString(text: string, ctx: Context): Promise<string> {
    try {
      const templates = this.liquid.parse(text, "custom_liquid");
      return (await renderTemplates(this.liquid, templates, ctx)) as string;
    } catch (e) {
      return liquidErrorMessage("custom_liquid", undefined, (e as Error).message.split("\n")[0], true);
    }
  }

  /* ---------------------------------------------------------------- Sections */

  async renderSectionInstance(state: RenderState, inst: SectionInstance, _ctx: Context, index = 0): Promise<string> {
    void _ctx;
    const path = `sections/${inst.type}.liquid`;
    try {
      const loaded = await this.load(path);
      if (!loaded) return `<!-- section ${inst.id}: ${path} introuvable -->`;
      const schema = loaded.schema ?? {};
      const { settings, blocks, liquidSettings } = resolveSectionSettings(state, inst, schema);
      const ctx = new Context({}, this.liquid.options, { globals: state.globals, sync: false }, { liquid: this.liquid });
      // Réglages de type `liquid` (section et blocs) : Shopify rend leur contenu Liquid.
      for (const [target, id] of liquidSettings) {
        if (typeof target[id] === "string" && target[id]) target[id] = await this.renderString(target[id] as string, ctx);
      }
      const section = {
        id: inst.id, settings, blocks, index: index + 1, index0: index, location: inst.group ? inst.group.replace(/group/, "").replace(/^-|-$/g, "") || "template" : "template",
      };
      ctx.push({ section });
      const body = await renderTemplates(this.liquid, loaded.templates, ctx);
      const tag = typeof schema.tag === "string" && /^[a-z]+$/.test(schema.tag) ? schema.tag : "div";
      const classes = ["shopify-section", inst.group ? `shopify-section-group-${inst.group}` : "", typeof schema.class === "string" ? schema.class : ""].filter(Boolean).join(" ");
      const design = state.designMode ? ` data-section-id="${escapeAttr(inst.id)}" data-section-type="${escapeAttr(inst.type)}"` : "";
      return `<${tag} id="shopify-section-${escapeAttr(inst.id)}" class="${classes}"${design}>${body}</${tag}>`;
    } catch (e) {
      const msg = (e as Error).message.split("\n")[0];
      const box = state.designMode ? `<div style="border:1px solid #d33;color:#d33;padding:8px;font:12px monospace">Section ${escapeAttr(inst.id)} : ${escapeAttr(msg)}</div>` : "";
      return `<!-- section ${escapeAttr(inst.id)} error: ${escapeAttr(msg)} -->${box}`;
    }
  }

  async renderGroup(state: RenderState, name: string, ctx: Context): Promise<string> {
    const group = parseJsonLenient<JsonTemplate & { type?: string }>(await this.source.get(`sections/${name}.json`));
    if (!group?.sections) return `<!-- section group ${escapeAttr(name)} introuvable -->`;
    const order = group.order ?? Object.keys(group.sections);
    let out = "";
    let i = 0;
    for (const id of order) {
      const s = group.sections[id];
      if (!s || s.disabled) continue;
      out += await this.renderSectionInstance(state, { ...s, id, group: name }, ctx, i++);
    }
    return out;
  }
}

/** Réglages effectifs d'une section : valeurs par défaut du schéma, puis preset, puis valeurs de l'instance. */
function resolveSectionSettings(state: RenderState, inst: SectionInstance, schema: SectionSchema) {
  const resolver = state.resolver;
  let rawSettings: Record<string, unknown> = { ...defaultsOf(schema.settings) };
  let rawBlocks: BlockInstance[] = [];
  const preset = schema.presets?.[0] ?? schema.default;
  // Section sans réglages ni blocs (ex. {% section %} jamais configurée) : on applique le premier preset.
  if (inst.settings == null && inst.blocks == null && preset) {
    rawSettings = { ...rawSettings, ...(preset.settings ?? {}) };
    rawBlocks = (preset.blocks ?? []).map((b, i) => ({ id: `${inst.id}-${b.type}-${i + 1}`, type: b.type, settings: b.settings ?? {} }));
  } else {
    rawSettings = { ...rawSettings, ...(inst.settings ?? {}) };
    const map = inst.blocks ?? {};
    const order = inst.block_order ?? Object.keys(map);
    rawBlocks = order.filter((id) => map[id]).map((id) => ({ ...map[id], id }));
  }
  const blockDefs = new Map((schema.blocks ?? []).map((b) => [b.type, b]));
  const liquidSettings: Array<[Record<string, unknown>, string]> = [];
  const blocks = rawBlocks
    .filter((b) => !b.disabled && b.type !== "@app")
    .map((b) => {
      const def = blockDefs.get(b.type);
      const settings = materialize(def?.settings, { ...defaultsOf(def?.settings), ...(b.settings ?? {}) }, resolver);
      for (const id of liquidSettingIds(def?.settings)) liquidSettings.push([settings, id]);
      const shopify_attributes = state.designMode ? `data-shopify-editor-block="${escapeAttr(JSON.stringify({ id: b.id, type: b.type }))}"` : "";
      return { id: b.id, type: b.type, settings, shopify_attributes };
    });
  const settings = materialize(schema.settings, rawSettings, resolver);
  for (const id of liquidSettingIds(schema.settings)) liquidSettings.push([settings, id]);
  return { settings, blocks, liquidSettings };
}

const escapeAttr = (s: unknown) => toStr(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ------------------------------------------------------------------ Rendu tolérant aux erreurs */

/**
 * Remplace le rendu de liste de gabarits de liquidjs : une erreur dans une sortie ou un tag devient
 * un message inline « Liquid error (fichier line n): … » et le rendu continue, comme sur Shopify.
 */
function patchRenderer(liquid: Liquid) {
  const renderer = liquid.renderer as unknown as { renderTemplates: (templates: Template[], ctx: Context, emitter?: Emitter) => Generator<unknown, string, unknown> };
  renderer.renderTemplates = function* (templates, ctx, emitter) {
    const em: Emitter = emitter ?? { buffer: "", write(html: unknown) { this.buffer += toStr(html); } };
    for (const tpl of templates) {
      try {
        const html = (yield tpl.render(ctx, em)) as unknown;
        if (html) em.write(html);
        if (ctx.breakCalled || ctx.continueCalled) break;
      } catch (e) {
        const err = e as Error & { originalError?: Error };
        const message = (err.originalError ?? err).message.split("\n")[0].replace(/, file:.*$/, "").replace(/, line:\d+, col:\d+$/, "");
        em.write(liquidErrorMessage(tpl.token.file, lineOf(tpl.token), message));
      }
    }
    return em.buffer;
  };
}

async function renderTemplates(liquid: Liquid, templates: Template[], ctx: Context): Promise<string> {
  return (await toPromise(liquid.renderer.renderTemplates(templates, ctx))) as string;
}

/* ------------------------------------------------------------------ Registre des moteurs */

const engines = new LRU<string, Engine>(50);

function engineFor(source: ThemeSource, locale: string): Engine {
  const key = source.id && source.version ? `${source.id}@${source.version}@${locale}` : null;
  let engine = key ? engines.get(key) : undefined;
  if (!engine) {
    engine = new Engine(locale);
    if (key) engines.set(key, engine);
  }
  engine.source = source;
  return engine;
}

/* ------------------------------------------------------------------ Contexte global d'une page */

async function buildState(engine: Engine, source: ThemeSource, data: PageData): Promise<RenderState> {
  const locale = data.locale || "en";
  const [translations, config] = await Promise.all([engine.translations(locale), engine.themeConfig()]);
  const root = data.routes?.root_url || "/";
  const products = Object.values(data.all_products ?? {});
  const collections = handleIndexed(data.collections ?? [], (h) => (h === "all" ? allCollection(products.length ? products : (data.collections ?? []).flatMap((c) => c.products), root) : undefined));
  const findProduct = (h: string): ShopifyProduct | undefined => data.all_products?.[h] ?? (data.collections ?? []).flatMap((c) => c.products).find((p) => p.handle === h) ?? (data.product?.handle === h ? data.product : undefined);
  const images = new Proxy((data.images ?? {}) as Record<string, unknown>, { get: (t, p) => (typeof p === "string" ? t[p] ?? assetImage(p, source.assetUrl(p)) : undefined) });

  // Réglages du thème : défauts du schéma ← settings_data.current ← réglages fournis par l'app.
  const raw = { ...defaultsOf(config.schemaFlat), ...config.current, ...(data.settings ?? {}) };
  const groupDef = config.schemaFlat.find((d) => d.type === "color_scheme_group");
  const schemes: SchemeDrop[] = groupDef ? buildSchemes(groupDef, raw[groupDef.id as string]) : [];
  const schemeById = (id: string) => schemes.find((s) => s.id === id) ?? (groupDef ? new SchemeDrop(id, materialize(groupDef.definition, defaultsOf(groupDef.definition), {})) : new SchemeDrop(id, {}));
  const globals: Record<string, unknown> = {};
  const state = new RenderState(engine, source, data, translations, schemes, (config.current.sections as Record<string, Partial<SectionInstance>> | undefined) ?? {}, globals);
  const resolver: Resolver = {
    product: findProduct,
    collection: (h) => (collections as unknown as Record<string, unknown>)[h] ?? undefined,
    page: (h) => data.pages?.[h],
    blog: (h) => data.blogs?.[h],
    article: (h) => data.articles?.[h] ?? data.articles?.[h.split("/").pop() ?? h],
    linklist: (h) => data.linklists?.[h],
    // Image de la bibliothèque (adresse connue), sinon toute adresse http(s) ou /uploads/… (dimensions par défaut).
    image: (name) => data.images?.[name] ?? (/^(https?:)?\//.test(name) ? { id: name, src: name, alt: "", width: 1600, height: 1600, aspect_ratio: 1, media_type: "image" as const } : null),
    scheme: schemeById,
    font: (f) => state.fonts.add(f),
    root,
  };
  state.resolver = resolver;
  const settings = materialize(config.schemaFlat, raw, resolver);
  if (groupDef) settings[groupDef.id as string] = schemes;
  state.settings = settings;

  const template = new TemplateDrop(data.template, data.template_suffix ?? "");
  const product = data.product ? { ...data.product, options_by_name: caseInsensitive(data.product.options_by_name ?? {}) } : undefined;
  const theme = { id: 1, name: config.themeName, role: "main" };
  const shopify = {
    shop: data.shop?.permanent_domain ?? data.shop?.domain ?? "", locale, currency: { active: data.money?.currency ?? "EUR", rate: String(data.money?.rate ?? 1) }, country: data.localization?.country?.iso_code ?? "FR",
    theme: { ...theme, schema_name: config.themeName, schema_version: "1.0" }, routes: { root }, designMode: !!data.design_mode, cdnHost: "",
  };
  const contentForHeader = `${data.content_for_header ?? ""}\n<script>window.Shopify = window.Shopify || {};Object.assign(window.Shopify, ${JSON.stringify(shopify)});</script>`;

  Object.assign(globals, {
    ...data,
    product, collections, images, template, settings, theme,
    handle: data.product?.handle ?? data.collection?.handle ?? data.page?.handle ?? data.article?.handle ?? data.blog?.handle ?? toStr(template),
    content_for_header: contentForHeader,
    customer: data.customer ?? null,
    current_tags: data.current_tags ?? null,
    current_page: data.current_page || 1,
    powered_by_link: "", scripts: "", additional_checkout_buttons: false, content_for_additional_checkout_buttons: "", country_option_tags: data.country_option_tags ?? "", all_country_option_tags: data.country_option_tags ?? "",
    page_image: data.product?.featured_image ?? data.shop?.brand?.logo ?? null,
    metaobjects: {}, app: {}, closest: { product: data.product ?? null, collection: data.collection ?? null, article: data.article ?? null, blog: data.blog ?? null, page: data.page ?? null },
    checkout: null, order: data.order ?? null, gift_card: null, comment: null, address: data.address ?? null,
  });
  delete globals.form_results;
  delete globals.money;
  delete globals.design_mode;
  Object.defineProperty(globals, RS, { value: state, enumerable: false });
  return state;
}

/* ------------------------------------------------------------------ Gabarits */

async function findTemplate(source: ThemeSource, name: string, suffix?: string): Promise<{ path: string; json: JsonTemplate | null; text: string } | null> {
  const candidates = suffix ? [`${name}.${suffix}.json`, `${name}.${suffix}.liquid`] : [];
  candidates.push(`${name}.json`, `${name}.liquid`);
  for (const c of candidates) {
    const text = await source.get(`templates/${c}`);
    if (text == null) continue;
    return { path: `templates/${c}`, json: c.endsWith(".json") ? parseJsonLenient<JsonTemplate>(text) : null, text };
  }
  return null;
}

async function renderTemplateBody(engine: Engine, state: RenderState, tpl: { path: string; json: JsonTemplate | null; text: string }): Promise<string> {
  if (tpl.json) {
    if (tpl.json.layout === false) state.layout = null;
    else if (typeof tpl.json.layout === "string") state.layout = tpl.json.layout;
    const sections = tpl.json.sections ?? {};
    const order = tpl.json.order ?? Object.keys(sections);
    let out = "";
    let i = 0;
    const ctx = new Context({}, engine.liquid.options, { globals: state.globals, sync: false }, { liquid: engine.liquid });
    for (const id of order) {
      const s = sections[id];
      if (!s || s.disabled) continue;
      out += await engine.renderSectionInstance(state, { ...s, id }, ctx, i++);
    }
    return out;
  }
  if (!tpl.json && tpl.path.endsWith(".json")) return `<!-- ${tpl.path}: JSON invalide -->`;
  try {
    const loaded = await engine.load(tpl.path);
    if (!loaded) return "";
    const ctx = new Context({}, engine.liquid.options, { globals: state.globals, sync: false }, { liquid: engine.liquid });
    return await renderTemplates(engine.liquid, loaded.templates, ctx);
  } catch (e) {
    return liquidErrorMessage(tpl.path, undefined, (e as Error).message.split("\n")[0], true);
  }
}

/** Feuilles de style et scripts collectés ({% stylesheet %}, {% javascript %}) à placer en fin de body. */
function collectedAssets(state: RenderState): string {
  let out = "";
  if (state.stylesheets.length) out += `<style data-shopify-collected>${state.stylesheets.join("\n")}</style>`;
  if (state.javascripts.length) out += `<script>(function(){${state.javascripts.join("\n})();(function(){")}\n})();</script>`;
  return out;
}

/** Insère avant </head> ; sans <head> (layout none, fragment) on n'ajoute rien. */
function injectHead(html: string, head: string): string {
  if (!head) return html;
  const i = html.search(/<\/head>/i);
  return i >= 0 ? html.slice(0, i) + head + html.slice(i) : html;
}

function injectBodyEnd(html: string, extra: string): string {
  if (!extra) return html;
  const i = html.search(/<\/body>/i);
  return i >= 0 ? html.slice(0, i) + extra + html.slice(i) : html + extra;
}

/* ------------------------------------------------------------------ API publique */

export async function renderPage(source: ThemeSource, data: PageData): Promise<RenderResult> {
  const engine = engineFor(source, data.locale || "en");
  const state = await buildState(engine, source, data);
  const headers = { "content-type": "text/html; charset=utf-8" };
  let tpl = await findTemplate(source, data.template, data.template_suffix);
  let status = data.template === "404" ? 404 : 200;
  if (!tpl && data.template !== "404") {
    tpl = await findTemplate(source, "404");
    status = 404;
  }
  const hasTheme = (await source.get("layout/theme.liquid")) != null;
  if (!tpl && !hasTheme) {
    return { html: `<!doctype html><html><head><meta charset="utf-8"><title>404</title></head><body><h1>Page introuvable</h1><p>Le thème n'a ni gabarit « ${escapeAttr(data.template)} » ni layout/theme.liquid.</p></body></html>`, status: 404, headers };
  }
  const body = tpl ? await renderTemplateBody(engine, state, tpl) : "<h1>404</h1>";
  const layoutName = state.layout === undefined ? "theme" : state.layout;
  let html = body;
  if (layoutName !== null) {
    try {
      html = await renderLayout(engine, state, layoutName, body) ?? (layoutName !== "theme" ? await renderLayout(engine, state, "theme", body) : null) ?? body;
    } catch (e) {
      html = `${liquidErrorMessage(`layout/${layoutName}.liquid`, undefined, (e as Error).message.split("\n")[0], true)}\n${body}`;
    }
  }
  html = injectHead(html, state.fonts.headTags());
  html = injectBodyEnd(html, collectedAssets(state));
  return { html, status, headers };
}

/** Rend le layout autour du corps ; null si le fichier n'existe pas. */
async function renderLayout(engine: Engine, state: RenderState, name: string, body: string): Promise<string | null> {
  const loaded = await engine.load(`layout/${name}.liquid`);
  if (!loaded) return null;
  const ctx = new Context({ content_for_layout: body }, engine.liquid.options, { globals: state.globals, sync: false }, { liquid: engine.liquid });
  return renderTemplates(engine.liquid, loaded.templates, ctx);
}

/** Rend une section seule (API « Section Rendering » : `?sections=a,b` ou `?section_id=`). */
export async function renderSection(source: ThemeSource, data: PageData, sectionId: string): Promise<string> {
  const engine = engineFor(source, data.locale || "en");
  const state = await buildState(engine, source, data);
  const ctx = new Context({}, engine.liquid.options, { globals: state.globals, sync: false }, { liquid: engine.liquid });
  let inst: SectionInstance | null = null;
  const tpl = await findTemplate(source, data.template, data.template_suffix);
  const fromTemplate = tpl?.json?.sections?.[sectionId];
  if (fromTemplate) inst = { ...fromTemplate, id: sectionId };
  if (!inst) {
    for (const file of await source.list("sections/")) {
      if (!file.endsWith(".json")) continue;
      const group = parseJsonLenient<JsonTemplate>(await source.get(file));
      const s = group?.sections?.[sectionId];
      if (s) {
        inst = { ...s, id: sectionId, group: file.replace(/^sections\//, "").replace(/\.json$/, "") };
        break;
      }
    }
  }
  if (!inst && (await source.get(`sections/${sectionId}.liquid`)) != null) {
    const saved = state.sectionSettings[sectionId];
    inst = { id: sectionId, type: sectionId, static: true, settings: saved?.settings, blocks: saved?.blocks, block_order: saved?.block_order };
  }
  if (!inst) return `<!-- section ${escapeAttr(sectionId)} introuvable -->`;
  const html = await engine.renderSectionInstance(state, inst, ctx);
  return html + collectedAssets(state);
}

/** config/settings_schema.json + settings_data.json → réglages effectifs (valeurs brutes : défauts + current) et schéma. */
export async function themeSettings(source: ThemeSource): Promise<{ settings: Record<string, unknown>; schema: unknown[] }> {
  const schema = await readSettingsSchema(source);
  const data = await readSettingsData(source);
  const flat = flattenSchemaSettings(schema);
  const settings: Record<string, unknown> = { ...defaultsOf(flat) };
  for (const [k, v] of Object.entries(data.current)) if (k !== "sections" && k !== "content_for_index" && k !== "blocks") settings[k] = v;
  return { settings, schema };
}

/** Schéma ({% schema %}) d'une section : name, settings, blocks, presets, max_blocks… ou null. */
export async function sectionSchema(source: ThemeSource, type: string): Promise<Record<string, unknown> | null> {
  const text = await source.get(`sections/${type}.liquid`);
  if (text == null) return null;
  return parseSectionSchema(prepareSource(text).schema);
}
