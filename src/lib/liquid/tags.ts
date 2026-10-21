/**
 * Tags Liquid propres à Shopify : render/include (chargés depuis le thème), section/sections, form, paginate,
 * style, layout, content_for, et les marqueurs internes __stylesheet/__javascript (blocs extraits avant analyse).
 */
import { AssignTag, Context, evalToken, Hash, Liquid, Tag, TagToken, Template, TopLevelToken, toPromise, type Parser, type Tokenizer, type ValueToken } from "liquidjs";
import { toNum, toStr } from "./drops";
import { stateOf, type RenderState } from "./state";
import type { ShopifyPaginate } from "./types";

/** Messages d'erreur au format Shopify : « Liquid error (snippets/x line 3): … ». */
export function liquidErrorMessage(file: string | undefined, line: number | undefined, message: string, syntax = false): string {
  const where = file ? ` (${file.replace(/\.liquid$/, "")}${line ? ` line ${line}` : ""})` : "";
  return `Liquid ${syntax ? "syntax " : ""}error${where}: ${message}`;
}

export function lineOf(token: { input?: string; begin?: number }): number | undefined {
  if (!token.input || token.begin == null) return undefined;
  let n = 1;
  for (let i = 0; i < token.begin; i++) if (token.input.charCodeAt(i) === 10) n++;
  return n;
}

/** Itération « à la Liquid » : tableaux, chaînes non vides, objets (paires), nil → []. */
export function enumerate(v: unknown): unknown[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "string") return v ? [v] : [];
  if (typeof v === "object") {
    if (typeof (v as Iterable<unknown>)[Symbol.iterator] === "function") return Array.from(v as Iterable<unknown>);
    return Object.entries(v as Record<string, unknown>);
  }
  return [];
}

const join = (root: string, path: string) => `${root.replace(/\/+$/, "")}/${path}`;

async function render(liquid: Liquid, templates: Template[], ctx: Context): Promise<string> {
  return (await toPromise(liquid.renderer.renderTemplates(templates, ctx))) as string;
}

function requireState(ctx: Context, tag: string): RenderState {
  const s = stateOf(ctx);
  if (!s) throw new Error(`le tag ${tag} nécessite un rendu de page (renderPage)`);
  return s;
}

/* ------------------------------------------------------------------ render / include */

type Binding = { value: ValueToken; alias?: string };

/** Lecture d'un nom de fichier puis des clauses `with x as y` / `for xs as y` et des paramètres `a: b`. */
function parsePartial(tokenizer: Tokenizer, liquid: Liquid) {
  const file = tokenizer.readValue();
  let withBinding: Binding | undefined, forBinding: Binding | undefined;
  while (!tokenizer.end()) {
    tokenizer.skipBlank();
    const begin = tokenizer.p;
    const keyword = tokenizer.readIdentifier();
    if (keyword.content === "with" || keyword.content === "for") {
      tokenizer.skipBlank();
      if (tokenizer.peek() !== ":") {
        const value = tokenizer.readValue();
        if (value) {
          const beforeAs = tokenizer.p;
          const asStr = tokenizer.readIdentifier();
          let alias: string | undefined;
          if (asStr.content === "as") alias = tokenizer.readIdentifier().content;
          else tokenizer.p = beforeAs;
          const binding = { value: value as ValueToken, alias };
          if (keyword.content === "with") withBinding = binding;
          else forBinding = binding;
          tokenizer.skipBlank();
          if (tokenizer.peek() === ",") tokenizer.advance();
          continue;
        }
      }
    }
    tokenizer.p = begin;
    break;
  }
  const hash = new Hash(tokenizer, liquid.options.keyValueSeparator);
  return { file, withBinding, forBinding, hash };
}

class ForloopDrop {
  i = 0;
  readonly name: string;
  constructor(readonly length: number, collection: string, variable: string) {
    this.name = `${variable}-${collection}`;
  }
  get index0() { return this.i; }
  get index() { return this.i + 1; }
  get first() { return this.i === 0; }
  get last() { return this.i === this.length - 1; }
  get rindex() { return this.length - this.i; }
  get rindex0() { return this.length - this.i - 1; }
}

export class RenderTag extends Tag {
  private file: ValueToken | undefined;
  private withBinding?: Binding;
  private forBinding?: Binding;
  private hash: Hash;
  /** `include` partage la portée du parent et expose `include.<param>` ; `render` isole. */
  private shared: boolean;
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser, shared = false) {
    super(token, remainTokens, liquid);
    void parser;
    const p = parsePartial(this.tokenizer, liquid);
    this.file = p.file as ValueToken | undefined;
    this.withBinding = p.withBinding;
    this.forBinding = p.forBinding;
    this.hash = p.hash;
    this.shared = shared;
  }
  async render(ctx: Context): Promise<string> {
    const name = toStr(await toPromise(evalToken(this.file, ctx)));
    const state = requireState(ctx, "render");
    const path = `snippets/${name}.liquid`;
    let loaded;
    try {
      loaded = await state.engine.load(path);
    } catch (e) {
      return liquidErrorMessage(path, undefined, (e as Error).message.split("\n")[0], true);
    }
    if (!loaded) return `Liquid error: Could not find asset ${path}`;
    const params = (await toPromise(this.hash.render(ctx))) as Record<string, unknown>;
    if (this.shared) {
      ctx.push({ ...params, include: params });
      if (this.withBinding) ctx.bottom()[name] = await toPromise(evalToken(this.withBinding.value, ctx));
      try {
        return await render(this.liquid, loaded.templates, ctx);
      } finally {
        ctx.pop();
      }
    }
    const childCtx = ctx.spawn();
    const scope = childCtx.bottom();
    // Comme sur Shopify, un snippet rendu depuis une section voit `section` (Impact, Dawn s'en servent).
    const section = ctx.getSync(["section"]);
    if (section !== undefined) scope.section = section;
    Object.assign(scope, params);
    if (this.withBinding) scope[this.withBinding.alias ?? name] = await toPromise(evalToken(this.withBinding.value, ctx));
    if (this.forBinding) {
      const { value, alias } = this.forBinding;
      const items = enumerate(await toPromise(evalToken(value, ctx)));
      const forloop = new ForloopDrop(items.length, value.getText(), alias ?? name);
      scope.forloop = forloop;
      let out = "";
      for (const item of items) {
        scope[alias ?? name] = item;
        out += await render(this.liquid, loaded.templates, childCtx);
        forloop.i++;
      }
      return out;
    }
    return render(this.liquid, loaded.templates, childCtx);
  }
}

export class IncludeTag extends RenderTag {
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(token, remainTokens, liquid, parser, true);
  }
}

/* ------------------------------------------------------------------ section / sections / layout / content_for */

export class SectionTag extends Tag {
  private file: ValueToken | undefined;
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid);
    this.file = this.tokenizer.readValue() as ValueToken | undefined;
  }
  async render(ctx: Context): Promise<string> {
    const name = toStr(await toPromise(evalToken(this.file, ctx)));
    const state = requireState(ctx, "section");
    const saved = state.sectionSettings[name];
    return state.engine.renderSectionInstance(state, { id: name, type: name, static: true, settings: saved?.settings, blocks: saved?.blocks, block_order: saved?.block_order }, ctx);
  }
}

export class SectionsTag extends Tag {
  private file: ValueToken | undefined;
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid);
    this.file = this.tokenizer.readValue() as ValueToken | undefined;
  }
  async render(ctx: Context): Promise<string> {
    const name = toStr(await toPromise(evalToken(this.file, ctx)));
    return requireState(ctx, "sections").engine.renderGroup(requireState(ctx, "sections"), name, ctx);
  }
}

export class LayoutTag extends Tag {
  private file: ValueToken | undefined;
  private none: boolean;
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid);
    this.none = /^\s*none\s*$/.test(token.args);
    this.file = this.none ? undefined : (this.tokenizer.readValue() as ValueToken | undefined);
  }
  async render(ctx: Context): Promise<string> {
    const state = stateOf(ctx);
    if (!state) return "";
    state.layout = this.none ? null : toStr(await toPromise(evalToken(this.file, ctx))) || undefined;
    return "";
  }
}

/** `{% content_for 'blocks' %}` (blocs de thème, dossier blocks/) : non pris en charge → vide. */
export class ContentForTag extends Tag {
  render() {
    return "";
  }
}

/* ------------------------------------------------------------------ Blocs : style, schema, stylesheet, javascript, doc */

function readBlock(name: string, remainTokens: TopLevelToken[], parser: Parser, parse: boolean): Template[] {
  const templates: Template[] = [];
  while (remainTokens.length) {
    const token = remainTokens.shift()!;
    if ("name" in token && (token as TagToken).name === `end${name}`) return templates;
    if (parse) templates.push(parser.parseToken(token, remainTokens));
  }
  throw new Error(`tag ${name} not closed`);
}

export class StyleTag extends Tag {
  private templates: Template[];
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(token, remainTokens, liquid);
    this.templates = readBlock("style", remainTokens, parser, true);
  }
  async render(ctx: Context): Promise<string> {
    return `<style data-shopify>${await render(this.liquid, this.templates, ctx)}</style>`;
  }
}

/** Bloc dont le contenu n'est pas rendu (schema/stylesheet/javascript/doc restés dans le flux). */
function rawBlock(name: string) {
  return class extends Tag {
    constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
      super(token, remainTokens, liquid);
      readBlock(name, remainTokens, parser, false);
    }
    render() {
      return "";
    }
  };
}

/** Marqueur posé par prepareSource : `{% __stylesheet 0 %}` → le CSS n° 0 du fichier courant est collecté (une fois par fichier). */
function assetMarker(kind: "stylesheets" | "javascripts") {
  return class extends Tag {
    private index: number;
    constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
      super(token, remainTokens, liquid);
      this.index = parseInt(token.args, 10) || 0;
    }
    async render(ctx: Context): Promise<string> {
      const state = stateOf(ctx);
      const file = this.token.file;
      if (!state || !file) return "";
      const key = `${kind}:${file}:${this.index}`;
      if (state.assetKeys.has(key)) return "";
      state.assetKeys.add(key);
      const loaded = await state.engine.load(file);
      const content = loaded?.[kind][this.index];
      if (content) state[kind].push(content);
      return "";
    }
  };
}

/* ------------------------------------------------------------------ form */

function formAction(type: string, state: RenderState, obj: unknown): string {
  const r = state.data.routes;
  const root = r.root_url || "/";
  switch (type) {
    case "product": return r.cart_add_url;
    case "cart": return r.cart_url;
    case "customer": return join(root, "newsletter");
    case "contact": return join(root, "contact");
    case "customer_login": return r.account_login_url;
    case "guest_login": return r.account_login_url;
    case "create_customer": return r.account_register_url;
    case "recover_customer_password": return r.account_recover_url;
    case "reset_customer_password": return join(r.account_url, "reset");
    case "activate_customer_password": return join(r.account_url, "activate");
    case "customer_address": return r.account_addresses_url;
    case "localization": return join(root, "localization");
    case "currency": return join(root, "currency");
    case "storefront_password": return join(root, "password");
    case "new_comment": return `${(obj as { url?: string })?.url ?? state.data.article?.url ?? join(root, "blogs")}/comments`;
    default: return root;
  }
}

/** Objet `form.errors` : itérable (noms de champs), avec messages, translated_fields et full_messages. */
function formErrors(messages: string[]): unknown {
  if (!messages.length) return null;
  const fields = messages.map((_, i) => (i === 0 ? "form" : `form_${i}`));
  return Object.assign(fields, {
    messages: Object.fromEntries(fields.map((f, i) => [f, messages[i]])),
    translated_fields: Object.fromEntries(fields.map((f) => [f, f])),
    full_messages: messages,
  });
}

export class FormTag extends Tag {
  private type: ValueToken | undefined;
  private positional: ValueToken[] = [];
  private hash: Hash;
  private templates: Template[];
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(token, remainTokens, liquid);
    const tk = this.tokenizer;
    this.type = tk.readValue() as ValueToken | undefined;
    // Arguments positionnels (objet du formulaire) jusqu'au premier `clé: valeur`.
    while (!tk.end()) {
      tk.skipBlank();
      if (tk.peek() === ",") tk.advance();
      tk.skipBlank();
      const begin = tk.p;
      const ident = tk.readIdentifier();
      tk.skipBlank();
      const isHash = ident.content && tk.peek() === ":";
      tk.p = begin;
      if (isHash || tk.end()) break;
      const v = tk.readValue();
      if (!v) break;
      this.positional.push(v as ValueToken);
    }
    this.hash = new Hash(tk, liquid.options.keyValueSeparator);
    this.templates = readBlock("form", remainTokens, parser, true);
  }
  async render(ctx: Context): Promise<string> {
    const type = toStr(await toPromise(evalToken(this.type, ctx)));
    const state = requireState(ctx, "form");
    const obj = this.positional.length ? await toPromise(evalToken(this.positional[0], ctx)) : undefined;
    const params = (await toPromise(this.hash.render(ctx))) as Record<string, unknown>;
    const result = state.data.form_results?.[type];
    const fields = result?.fields ?? {};
    const product = type === "product" ? (obj as { id?: string } | undefined) : undefined;
    const defaultId: Record<string, string> = { product: `product_form_${product?.id ?? ""}`, contact: "contact_form", customer: "contact_form", customer_login: "customer_login", create_customer: "create_customer", recover_customer_password: "recover_customer_password", localization: "localization_form", storefront_password: "login_form", new_comment: "comment_form" };
    const id = params.id != null ? toStr(params.id) : defaultId[type] ?? `${type}_form`;
    const form = {
      id, posted_successfully: !!result?.posted_successfully, errors: formErrors(result?.errors ?? []), password_needed: type === "customer_login",
      email: fields.email ?? "", author: fields.author ?? fields.name ?? "", body: fields.body ?? "", name: fields.name ?? "", phone: fields.phone ?? "", first_name: fields.first_name ?? "", last_name: fields.last_name ?? "",
      ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v])),
      address1: fields.address1 ?? "", address2: fields.address2 ?? "", city: fields.city ?? "", zip: fields.zip ?? "", country: fields.country ?? "", province: fields.province ?? "", company: fields.company ?? "",
      set_as_default_checkbox: "", return_to: state.data.request?.path ?? "/",
    };
    const attrs: Record<string, unknown> = { method: "post", action: formAction(type, state, obj), id, "accept-charset": "UTF-8" };
    if (type === "customer_address" || type === "create_customer") attrs.enctype = "multipart/form-data";
    for (const [k, v] of Object.entries(params)) if (k !== "id" && k !== "return_to") attrs[k] = v;
    const esc = (s: unknown) => toStr(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const attrText = Object.entries(attrs).filter(([, v]) => v !== null && v !== undefined && v !== false).map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`)).join("");
    let hidden = `<input type="hidden" name="form_type" value="${esc(type)}"><input type="hidden" name="utf8" value="✓">`;
    if (type === "localization" || type === "customer_login" || type === "storefront_password") hidden += `<input type="hidden" name="return_to" value="${esc(params.return_to ?? form.return_to)}">`;
    if (type === "customer") hidden += `<input type="hidden" name="contact[tags]" value="newsletter">`;
    if (type === "new_comment") hidden += `<input type="hidden" name="comment[article_id]" value="${esc((obj as { id?: string })?.id ?? "")}">`;
    ctx.push({ form });
    try {
      const body = await render(this.liquid, this.templates, ctx);
      return `<form${attrText}>${hidden}${body}</form>`;
    } finally {
      ctx.pop();
    }
  }
}

/* ------------------------------------------------------------------ paginate */

export class PaginateTag extends Tag {
  private collection: ValueToken | undefined;
  private by: ValueToken | undefined;
  private templates: Template[];
  private hash: Hash;
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(token, remainTokens, liquid);
    const tk = this.tokenizer;
    this.collection = tk.readValue() as ValueToken | undefined;
    tk.skipBlank();
    const kw = tk.readIdentifier();
    this.by = kw.content === "by" ? (tk.readValue() as ValueToken | undefined) : undefined;
    this.hash = new Hash(tk, liquid.options.keyValueSeparator);
    this.templates = readBlock("paginate", remainTokens, parser, true);
  }
  async render(ctx: Context): Promise<string> {
    const state = stateOf(ctx);
    const all = enumerate(await toPromise(evalToken(this.collection, ctx)));
    const size = Math.max(1, Math.round(toNum(this.by ? await toPromise(evalToken(this.by, ctx)) : 20)) || 20);
    const params = (await toPromise(this.hash.render(ctx))) as Record<string, unknown>;
    const current = Math.max(1, state?.data.current_page || 1);
    // Compte total : `<prop>_count` sur l'objet parent (collection.products_count…) sinon la longueur.
    const text = this.collection?.getText() ?? "";
    const parts = text.split(".");
    let items = all.length;
    let parent: Record<string, unknown> | undefined;
    if (parts.length > 1) {
      parent = (await toPromise(ctx._get(parts.slice(0, -1)))) as Record<string, unknown> | undefined;
      const prop = parts[parts.length - 1];
      const count = parent && (parent[`${prop}_count`] ?? (prop === "products" ? parent.all_products_count : undefined));
      if (typeof count === "number" && count > items) items = count;
    }
    const pages = Math.max(1, Math.ceil(items / size));
    // Déjà paginé en amont (pas plus d'une page d'éléments) : on ne découpe pas.
    const page = all.length > size ? all.slice((current - 1) * size, current * size) : all;
    const path = state?.data.request?.path ?? "/";
    // Les filtres et le tri de la requête courante restent dans les liens de pagination.
    const url = (n: number) => { const q = new URLSearchParams(state?.data.request_query ?? ""); q.set("page", String(n)); return `${path.split("?")[0]}?${q.toString()}`; };
    const window = Math.max(1, Math.round(toNum(params.window_size) || 3));
    const partsList: ShopifyPaginate["parts"] = [];
    let prevShown = 0;
    for (let n = 1; n <= pages; n++) {
      const show = n === 1 || n === pages || Math.abs(n - current) < window;
      if (!show) continue;
      if (n - prevShown > 1) partsList.push({ title: "&hellip;", url: "", is_link: false });
      partsList.push({ title: String(n), url: url(n), is_link: n !== current });
      prevShown = n;
    }
    const paginate: ShopifyPaginate = {
      current_page: current, current_offset: (current - 1) * size, items, page_size: size, pages, parts: partsList,
      next: current < pages ? { title: "Next &raquo;", url: url(current + 1), is_link: true } : null,
      previous: current > 1 ? { title: "&laquo; Previous", url: url(current - 1), is_link: true } : null,
      page_param: "page",
    };
    const scope: Record<string, unknown> = { paginate };
    if (page !== all) {
      // Rend la tranche visible sous le même nom (collection.products → copie de collection avec products découpés).
      if (parts.length === 1) scope[parts[0]] = page;
      else if (parent && typeof parent === "object") {
        const clone = Object.create(Object.getPrototypeOf(parent)) as Record<string, unknown>;
        Object.assign(clone, parent, { [parts[parts.length - 1]]: page });
        if (parts.length === 2) scope[parts[0]] = clone;
      }
    }
    ctx.push(scope);
    try {
      return await render(this.liquid, this.templates, ctx);
    } finally {
      ctx.pop();
    }
  }
}

/** Shopify analyse `assign` sans ancrage : `assign assign x = 1` passe (le premier mot est ignoré). On fait pareil. */
export class LaxAssignTag extends AssignTag {
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    const junk = /^\s*assign\s+(?=[\w\-.[\]]+\s*=)/.exec(token.args);
    if (junk) token.tokenizer.p += junk[0].length;
    super(token, remainTokens, liquid);
  }
}

/* ------------------------------------------------------------------ Enregistrement */

export function registerTags(liquid: Liquid) {
  liquid.registerTag("assign", LaxAssignTag);
  liquid.registerTag("render", RenderTag);
  liquid.registerTag("include", IncludeTag);
  liquid.registerTag("section", SectionTag);
  liquid.registerTag("sections", SectionsTag);
  liquid.registerTag("layout", LayoutTag);
  liquid.registerTag("content_for", ContentForTag);
  liquid.registerTag("style", StyleTag);
  liquid.registerTag("schema", rawBlock("schema"));
  liquid.registerTag("stylesheet", rawBlock("stylesheet"));
  liquid.registerTag("javascript", rawBlock("javascript"));
  liquid.registerTag("doc", rawBlock("doc"));
  liquid.registerTag("__stylesheet", assetMarker("stylesheets"));
  liquid.registerTag("__javascript", assetMarker("javascripts"));
  liquid.registerTag("form", FormTag);
  liquid.registerTag("paginate", PaginateTag);
}
