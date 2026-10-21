/**
 * Filtres Liquid de Shopify (https://shopify.dev/docs/api/liquid/filters) implémentés pour liquidjs.
 * Les filtres reçoivent les arguments nommés sous forme de paires [nom, valeur] ; `split()` les sépare.
 */
import { createHash, createHmac } from "node:crypto";
import { Drop, filters as builtin, type FilterImplOptions, type Liquid } from "liquidjs";
import { ColorDrop, hslToRgb, parseColor, rgbToHsl, toNum, toStr, type Rgba } from "./drops";
import { FontDrop, fontFaceCss, googleCssUrl, parseFontHandle } from "./fonts";
import { formatAmountOnly, formatMoney } from "./money";
import { stateOf, type RenderState } from "./state";
import { dateFormatFromLocale, translate } from "./translations";
import type { ShopifyImage, ShopifyProduct, ShopifyVariant } from "./types";

type Ctx = { context: import("liquidjs").Context; token: { args: Array<unknown> }; liquid: Liquid };
type Named = Record<string, unknown>;
// Les filtres manipulent des valeurs non typées venant des gabarits.
/* eslint-disable @typescript-eslint/no-explicit-any */
type F = (this: Ctx, value: any, ...args: any[]) => unknown;

/** Sépare arguments positionnels et nommés (`width: 300` arrive en ["width", 300]). */
function split(args: unknown[]): { pos: unknown[]; named: Named } {
  const pos: unknown[] = [];
  const named: Named = {};
  for (const a of args) {
    if (Array.isArray(a) && a.length === 2 && typeof a[0] === "string") named[a[0]] = a[1];
    else pos.push(a);
  }
  return { pos, named };
}

const esc = (s: unknown) => toStr(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const attrs = (o: Record<string, unknown>) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== false && v !== "").map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`)).join("");
const isBlank = (v: unknown): boolean => v == null || v === false || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0) || (v instanceof Drop && toStr(v) === "" && !(v as { id?: unknown }).id) || (typeof v === "object" && v !== null && !(v instanceof Drop) && !(v instanceof Date) && !Array.isArray(v) && Object.keys(v).length === 0);
const handleize = (s: unknown) => toStr(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/* ------------------------------------------------------------------ Images */

/** Résultat de `image_url` : une adresse qui se souvient de l'image (pour `image_tag`). */
export class ImageUrlDrop extends Drop {
  constructor(readonly base: string, readonly width: number | null, readonly height: number | null, readonly image: ShopifyImage | null, readonly query: Record<string, string>) {
    super();
  }
  url(width?: number | null, height?: number | null): string {
    const q: Record<string, string> = {};
    if (width) q.width = String(width);
    if (height) q.height = String(height);
    Object.assign(q, this.query);
    const qs = Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    return qs ? `${this.base}${this.base.includes("?") ? "&" : "?"}${qs}` : this.base;
  }
  get size() { return this.toString().length; }
  toString() { return this.url(this.width, this.height); }
  valueOf() { return this.toString(); }
  toJSON() { return this.toString(); }
}

/** Trouve l'image d'une valeur : image, produit, variante, collection, article, ligne de panier, adresse texte. */
function imageOf(v: unknown): ShopifyImage | null {
  if (v == null) return null;
  if (v instanceof ImageUrlDrop) return v.image ?? { id: "", src: v.base, alt: "", width: 0, height: 0, aspect_ratio: 0 };
  if (typeof v === "string") return v.startsWith("shopify://") ? null : { id: "", src: v, alt: "", width: 0, height: 0, aspect_ratio: 0 };
  if (typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.src === "string") return o as unknown as ShopifyImage;
  if (typeof o.preview_image === "object" && o.preview_image) return o.preview_image as ShopifyImage;
  for (const k of ["featured_image", "image", "featured_media"]) if (o[k] && typeof o[k] === "object") return imageOf(o[k]);
  return null;
}

const image_url: F = function (v, ...args) {
  const { named } = split(args);
  const img = imageOf(v);
  if (!img) return null;
  const width = named.width != null ? Math.round(toNum(named.width)) : null;
  const height = named.height != null ? Math.round(toNum(named.height)) : null;
  const q: Record<string, string> = {};
  if (named.crop) q.crop = toStr(named.crop);
  if (named.format) q.format = toStr(named.format);
  if (named.pad_color) q.pad_color = toStr(named.pad_color);
  return new ImageUrlDrop(img.src, width, height, img, q);
};

/** `img_url: '600x600'` (ancien filtre) : tailles "600x", "x400", "master", "large"… */
const img_url: F = function (v, size, ...args) {
  const img = imageOf(v);
  if (!img) return null;
  const named = split(args).named;
  const legacy: Record<string, number> = { pico: 16, icon: 32, thumb: 50, small: 100, compact: 160, medium: 240, large: 480, grande: 600, original: 1024 };
  const s = toStr(size);
  let w: number | null = null, h: number | null = null;
  const m = /^(\d*)x(\d*)$/.exec(s);
  if (m) { w = m[1] ? +m[1] : null; h = m[2] ? +m[2] : null; } else if (legacy[s]) w = legacy[s];
  const q: Record<string, string> = {};
  if (named.crop) q.crop = toStr(named.crop);
  return new ImageUrlDrop(img.src, w, h, img, q);
};

const DEFAULT_WIDTHS = [352, 832, 1200, 1920];

const image_tag: F = function (v, ...args) {
  const { named } = split(args);
  const drop = v instanceof ImageUrlDrop ? v : imageOf(v) ? new ImageUrlDrop(imageOf(v)!.src, null, null, imageOf(v), {}) : null;
  if (!drop) return "";
  const img = drop.image;
  const maxW = img?.width || 0;
  const widths = named.widths ? toStr(named.widths).split(",").map((w) => parseInt(w.trim(), 10)).filter(Boolean) : DEFAULT_WIDTHS;
  const srcset = widths.filter((w) => !maxW || w <= maxW).map((w) => `${drop.url(w, drop.height && drop.width ? Math.round((w * drop.height) / drop.width) : null)} ${w}w`);
  if (maxW && !widths.includes(maxW) && (!drop.width || maxW <= drop.width)) srcset.push(`${drop.url(maxW)} ${maxW}w`);
  const ratio = img && img.width && img.height ? img.height / img.width : null;
  const width = named.width != null ? toNum(named.width) : drop.width ?? (img?.width || undefined);
  const height = named.height != null ? toNum(named.height) : drop.height ?? (ratio && width ? Math.round(width * ratio) : img?.height || undefined);
  const a: Record<string, unknown> = {
    src: drop.toString(), alt: named.alt ?? img?.alt ?? "", srcset: srcset.length > 1 ? srcset.join(", ") : undefined, width: width || undefined, height: height || undefined,
    loading: named.loading, sizes: named.sizes, class: named.class, fetchpriority: named.fetchpriority, decoding: named.decoding, style: named.style, id: named.id,
  };
  for (const [k, val] of Object.entries(named)) if (!(k in a) && !["widths", "preload"].includes(k)) a[k] = val;
  if (named.preload) {
    const st = stateOf(this.context);
    st?.stylesheets.push(`/* preload ${drop} */`);
  }
  return `<img${attrs(a)}>`;
};

const placeholder_svg_tag: F = function (name, cls) {
  const klass = cls != null ? esc(cls) : "placeholder-svg";
  const kind = toStr(name);
  const inner = /collection|product|image|lifestyle|hero/.test(kind)
    ? `<rect width="525.5" height="525.5" fill="#f3f3f3"/><path d="M324.5 212.7h-149c-1.1 0-2 .9-2 2v118.8c0 1.1.9 2 2 2h149c1.1 0 2-.9 2-2V214.7c0-1.1-.9-2-2-2zm-2 2v79.4l-28.4-28.4c-1.6-1.6-4.1-1.6-5.7 0l-18.1 18.1-36.7-36.7c-1.6-1.6-4.1-1.6-5.7 0L177.5 297.5V214.7h145zm-145 118.8v-31.2l54.6-54.6 60.1 60.1c.8.8 1.8 1.2 2.8 1.2s2-.4 2.8-1.2l20.8-20.8 30.9 30.9v15.7h-172z" fill="#e0e0e0"/><circle cx="288.8" cy="251.1" r="13.7" fill="#e0e0e0"/>`
    : `<rect width="525.5" height="525.5" fill="#f3f3f3"/><path d="M262.8 177.9c-46.9 0-84.9 38-84.9 84.9s38 84.9 84.9 84.9 84.9-38 84.9-84.9-38-84.9-84.9-84.9zm0 155.8c-39.1 0-70.9-31.8-70.9-70.9s31.8-70.9 70.9-70.9 70.9 31.8 70.9 70.9-31.8 70.9-70.9 70.9z" fill="#e0e0e0"/>`;
  return `<svg class="${klass}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 525.5 525.5" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${inner}</svg>`;
};

/* ------------------------------------------------------------------ Assets */

const st = (ctx: Ctx): RenderState | undefined => stateOf(ctx.context);

const asset_url: F = function (v) {
  const s = st(this);
  return s ? s.source.assetUrl(toStr(v)) : `/assets/${toStr(v)}`;
};
const asset_img_url: F = function (v, size) {
  const s = st(this);
  const url = s ? s.source.assetUrl(toStr(v)) : `/assets/${toStr(v)}`;
  return img_url.call(this, { src: url }, size);
};
const inline_asset_content: F = async function (v) {
  const s = st(this);
  const name = toStr(v);
  const text = s ? await s.source.get(`assets/${name}`) : null;
  return text ?? "";
};
const stylesheet_tag: F = function (v, ...args) {
  const { named } = split(args);
  const href = toStr(v);
  const pre = named.preload ? `<link rel="preload" as="style" href="${esc(href)}">` : "";
  return `${pre}<link href="${esc(href)}" rel="stylesheet" type="text/css" media="${esc(named.media ?? "all")}">`;
};
const script_tag: F = (v) => `<script src="${esc(v)}" type="text/javascript"></script>`;
const preload_tag: F = function (v, ...args) {
  const { named } = split(args);
  return `<link rel="preload" href="${esc(v)}"${attrs({ as: named.as, type: named.type, crossorigin: named.crossorigin })}>`;
};
/** Scripts du CDN Shopify (option_selection.js…) : servis depuis nos assets si présents, sinon adresse neutre. */
const shopify_asset_url: F = function (v) {
  const s = st(this);
  return s ? s.source.assetUrl(`shopify/${toStr(v)}`) : `/assets/shopify/${toStr(v)}`;
};
const global_asset_url: F = shopify_asset_url;
const file_url: F = asset_url;
const file_img_url: F = asset_img_url;

/* ------------------------------------------------------------------ Traductions, argent, dates */

const t: F = function (key, ...args) {
  const s = st(this);
  const { named } = split(args);
  if (!s) return toStr(key);
  return translate(s.translations, toStr(key), named);
};

const money: F = function (v) {
  const s = st(this);
  return formatMoney(v, s?.data.money.format ?? "${{amount}}", s?.data.money.rate ?? 1);
};
const money_with_currency: F = function (v) {
  const s = st(this);
  return formatMoney(v, s?.data.money.formatWithCurrency ?? "${{amount}} USD", s?.data.money.rate ?? 1);
};
const money_without_trailing_zeros: F = function (v) {
  const s = st(this);
  return formatMoney(v, s?.data.money.format ?? "${{amount}}", s?.data.money.rate ?? 1, false);
};
const money_without_currency: F = function (v) {
  const s = st(this);
  return formatAmountOnly(v, s?.data.money.format ?? "${{amount}}", s?.data.money.rate ?? 1);
};

const NAMED_DATE_FORMATS: Record<string, string> = {
  abbreviated_date: "%b %d, %Y", basic: "%m/%d/%Y", date: "%B %d, %Y", date_at_time: "%B %d, %Y at %l:%M %P", default: "%A, %B %d, %Y at %l:%M %P %z", on_date: "on %b %d, %Y",
  month_day_year: "%B %d, %Y", month_year: "%B %Y", year: "%Y", short_date: "%d/%m/%Y", long_date: "%A, %B %d, %Y", time: "%H:%M",
};
const builtinDate = builtin.date as unknown as (this: unknown, v: unknown, format?: unknown, tz?: unknown) => string;
const date: F = function (v, ...args) {
  const { pos, named } = split(args);
  if (v == null || v === "") return v;
  let format: string | undefined = pos[0] != null ? toStr(pos[0]) : undefined;
  if (named.format) {
    const name = toStr(named.format);
    const s = st(this);
    format = (s && dateFormatFromLocale(s.translations, name)) ?? NAMED_DATE_FORMATS[name] ?? name;
  }
  // Les gabarits passent parfois des horodatages Unix sous forme de chaîne.
  const input = typeof v === "string" && /^\d{9,}$/.test(v) ? Number(v) : v;
  return builtinDate.call(this, input, format ?? "%B %d, %Y");
};
const time_tag: F = function (v, ...args) {
  const { pos, named } = split(args);
  const iso = builtinDate.call(this, v, "%Y-%m-%dT%H:%M:%SZ");
  const text = pos[0] != null || named.format ? date.call(this, v, ...args) : builtinDate.call(this, v, "%B %d, %Y");
  return `<time datetime="${esc(iso)}"${attrs({ datetime_format: undefined })}>${esc(text)}</time>`;
};

/* ------------------------------------------------------------------ Chaînes */

const escape: F = (v) => esc(v);
const escape_once: F = (v) => esc(toStr(v).replace(/&(amp|lt|gt|quot|#39);/g, (m, n) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[n as string] ?? m));
const handle: F = (v) => handleize(v);
const camelcase: F = (v) => toStr(v).replace(/[-_\s]+(.)?/g, (_, c: string) => (c ? c.toUpperCase() : "")).replace(/^./, (c) => c.toUpperCase());
const url_encode: F = (v) => encodeURIComponent(toStr(v)).replace(/%20/g, "+");
const url_escape: F = (v) => encodeURI(toStr(v));
const url_param_escape: F = (v) => encodeURIComponent(toStr(v)).replace(/%20/g, "+");
const stripHtml = (v: unknown) => toStr(v).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]*>/g, "");
const strip_html: F = (v) => stripHtml(v);
const newline_to_br: F = (v) => toStr(v).replace(/\r?\n/g, "<br />\n");
const highlight: F = (v, terms) => {
  const text = toStr(v), q = toStr(terms).trim();
  if (!q) return text;
  const re = new RegExp(`(${q.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.replace(re, '<strong class="highlight">$1</strong>');
};
const pluralize: F = (v, one, many) => (toNum(v) === 1 ? toStr(one) : toStr(many));
const splitF: F = (v, sep) => {
  const s = toStr(v);
  if (s === "") return [];
  const parts = s.split(toStr(sep));
  while (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
};
const format_code: F = (v) => toStr(v);
const md: F = (v) => toStr(v);
const base64_encode: F = (v) => Buffer.from(toStr(v), "utf8").toString("base64");
const base64_decode: F = (v) => Buffer.from(toStr(v), "base64").toString("utf8");
const base64_url_safe_encode: F = (v) => Buffer.from(toStr(v), "utf8").toString("base64url");
const base64_url_safe_decode: F = (v) => Buffer.from(toStr(v), "base64url").toString("utf8");
const md5: F = (v) => createHash("md5").update(toStr(v)).digest("hex");
const sha1: F = (v) => createHash("sha1").update(toStr(v)).digest("hex");
const sha256: F = (v) => createHash("sha256").update(toStr(v)).digest("hex");
const hmac_sha1: F = (v, key) => createHmac("sha1", toStr(key)).update(toStr(v)).digest("hex");
const hmac_sha256: F = (v, key) => createHmac("sha256", toStr(key)).update(toStr(v)).digest("hex");

/* ------------------------------------------------------------------ Nombres (coercition « à la Shopify ») */

const plus: F = (a, b) => toNum(a) + toNum(b);
const minus: F = (a, b) => toNum(a) - toNum(b);
const times: F = (a, b) => toNum(a) * toNum(b);
const modulo: F = (a, b) => { const d = toNum(b); return d ? toNum(a) % d : 0; };
const abs: F = (a) => Math.abs(toNum(a));
const ceil: F = (a) => Math.ceil(toNum(a));
const floor: F = (a) => Math.floor(toNum(a));
const at_least: F = (a, b) => Math.max(toNum(a), toNum(b));
const at_most: F = (a, b) => Math.min(toNum(a), toNum(b));
const round: F = (a, p) => { const n = toNum(a), d = toNum(p); return d ? Math.round(n * 10 ** d) / 10 ** d : Math.round(n); };
/** Division entière quand les deux opérandes sont entiers ET que le diviseur n'est pas écrit "100.0" dans le gabarit. */
const divided_by: F = function (a, b) {
  const x = toNum(a), y = toNum(b);
  if (!y) return 0;
  const litteral = (this.token.args[0] as { getText?: () => string } | undefined)?.getText?.() ?? "";
  const floatDivisor = /\./.test(litteral) || !Number.isInteger(y) || !Number.isInteger(x) || typeof b === "string" && /\./.test(b);
  return floatDivisor ? x / y : Math.trunc(x / y);
};
const sum: F = function (arr, prop) {
  const list = Array.isArray(arr) ? arr : [];
  return list.reduce((acc: number, item) => acc + toNum(prop != null ? (item as Record<string, unknown>)?.[toStr(prop)] : item), 0);
};

/* ------------------------------------------------------------------ Tableaux / divers */

const defaultF: F = (v, d, ...args) => {
  const { named } = split(args);
  if (named.allow_false && v === false) return v;
  return isBlank(v) ? d : v;
};
const json: F = (v) => {
  const seen = new WeakSet<object>();
  return JSON.stringify(v, function (_key, val: unknown) {
    if (typeof val === "function" || typeof val === "symbol") return undefined;
    if (val && typeof val === "object") {
      if (val instanceof Drop && typeof (val as { toJSON?: unknown }).toJSON !== "function") {
        const prim = val.valueOf();
        if (prim !== val && (typeof prim !== "object" || prim === null)) return prim;
        const o: Record<string, unknown> = {};
        for (const k of Object.keys(val)) o[k] = (val as Record<string, unknown>)[k];
        val = o;
      }
      if (seen.has(val as object)) return undefined;
      seen.add(val as object);
    }
    return val;
  }) ?? "null";
};
const where: F = function (arr, prop, value) {
  const list = Array.isArray(arr) ? arr : [];
  const key = toStr(prop);
  const read = (item: unknown) => (item && typeof item === "object" ? (item as Record<string, unknown>)[key] : undefined);
  if (value === undefined) return list.filter((i) => { const x = read(i); return x !== undefined && x !== null && x !== false && x !== ""; });
  return list.filter((i) => { const x = read(i); return x === value || toStr(x) === toStr(value); });
};
const sort_by: F = function (arr, prop) {
  const list = Array.isArray(arr) ? [...arr] : [];
  const key = toStr(prop);
  return list.sort((a, b) => { const x = (a as Record<string, unknown>)?.[key], y = (b as Record<string, unknown>)?.[key]; return x === y ? 0 : x == null ? 1 : y == null ? -1 : (x as number) > (y as number) ? 1 : -1; });
};
const within: F = (url, collection) => {
  const c = collection as { handle?: string } | null;
  const u = toStr(url);
  if (!c?.handle) return u;
  return u.replace(/^(.*?)\/products\//, `$1/collections/${c.handle}/products/`);
};

/* ------------------------------------------------------------------ Couleurs */

const colorOf = (v: unknown): Rgba | null => parseColor(v);
const fromRgba = (c: Rgba) => new ColorDrop({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b), a: Math.max(0, Math.min(1, c.a)) });
const withHsl = (c: Rgba, fn: (h: { h: number; s: number; l: number }) => void) => { const h = rgbToHsl(c.r, c.g, c.b); fn(h); return fromRgba({ ...hslToRgb(h.h, h.s, h.l), a: c.a }); };

const color_to_rgb: F = (v) => { const c = colorOf(v); return c ? (c.a < 1 ? `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${c.a})` : `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`) : v; };
const color_to_hex: F = (v) => { const c = colorOf(v); return c ? fromRgba({ ...c, a: 1 }).hex : v; };
const color_to_hsl: F = (v) => { const c = colorOf(v); if (!c) return v; const h = rgbToHsl(c.r, c.g, c.b); return c.a < 1 ? `hsla(${Math.round(h.h)}, ${Math.round(h.s)}%, ${Math.round(h.l)}%, ${c.a})` : `hsl(${Math.round(h.h)}, ${Math.round(h.s)}%, ${Math.round(h.l)}%)`; };
const color_extract: F = (v, field) => { const c = colorOf(v); if (!c) return null; const h = rgbToHsl(c.r, c.g, c.b); const map: Record<string, number> = { red: Math.round(c.r), green: Math.round(c.g), blue: Math.round(c.b), alpha: c.a, hue: Math.round(h.h), saturation: Math.round(h.s), lightness: Math.round(h.l) }; return map[toStr(field)] ?? null; };
const brightnessOf = (c: Rgba) => Math.round(((c.r * 299 + c.g * 587 + c.b * 114) / 1000) * 100) / 100;
const color_brightness: F = (v) => { const c = colorOf(v); return c ? brightnessOf(c) : null; };
const color_modify: F = (v, field, amount) => {
  const c = colorOf(v); if (!c) return v;
  const f = toStr(field), n = toNum(amount);
  if (f === "alpha") return fromRgba({ ...c, a: n });
  if (f === "red") return fromRgba({ ...c, r: n }); if (f === "green") return fromRgba({ ...c, g: n }); if (f === "blue") return fromRgba({ ...c, b: n });
  return withHsl(c, (h) => { if (f === "hue") h.h = n; else if (f === "saturation") h.s = n; else if (f === "lightness") h.l = n; });
};
const color_lighten: F = (v, amt) => { const c = colorOf(v); return c ? withHsl(c, (h) => { h.l = Math.min(100, h.l + toNum(amt)); }) : v; };
const color_darken: F = (v, amt) => { const c = colorOf(v); return c ? withHsl(c, (h) => { h.l = Math.max(0, h.l - toNum(amt)); }) : v; };
const color_saturate: F = (v, amt) => { const c = colorOf(v); return c ? withHsl(c, (h) => { h.s = Math.min(100, h.s + toNum(amt)); }) : v; };
const color_desaturate: F = (v, amt) => { const c = colorOf(v); return c ? withHsl(c, (h) => { h.s = Math.max(0, h.s - toNum(amt)); }) : v; };
const color_mix: F = (v, other, weight) => {
  const a = colorOf(v), b = colorOf(other); if (!a || !b) return v;
  const w = toNum(weight) / 100;
  return fromRgba({ r: a.r * w + b.r * (1 - w), g: a.g * w + b.g * (1 - w), b: a.b * w + b.b * (1 - w), a: a.a * w + b.a * (1 - w) });
};
const luminance = (c: Rgba) => { const f = (x: number) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
const color_contrast: F = (v, other) => { const a = colorOf(v), b = colorOf(other); if (!a || !b) return null; const l1 = luminance(a), l2 = luminance(b); return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 10) / 10; };
const color_difference: F = (v, other) => { const a = colorOf(v), b = colorOf(other); return a && b ? Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) : null; };
const brightness_difference: F = (v, other) => { const a = colorOf(v), b = colorOf(other); return a && b ? Math.abs(brightnessOf(a) - brightnessOf(b)) : null; };
const hex_to_rgba: F = (v, alpha) => { const c = colorOf(v); return c ? `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${alpha != null ? toNum(alpha) : 1})` : v; };

/* ------------------------------------------------------------------ Polices */

const fontOf = (v: unknown): FontDrop | null => (v instanceof FontDrop ? v : parseFontHandle(v));
const font_face: F = function (v, ...args) {
  const f = fontOf(v); if (!f) return "";
  st(this)?.fonts.add(f);
  return fontFaceCss(f, split(args).named.font_display as string | undefined);
};
const font_modify: F = function (v, prop, value) {
  const f = fontOf(v); if (!f) return null;
  const p = toStr(prop), val = toStr(value);
  let out: FontDrop;
  if (p === "style") out = f.modify({ style: val === "italic" || val === "oblique" ? "italic" : "normal" });
  else {
    const map: Record<string, number> = { normal: 400, bold: 700, lighter: Math.max(100, f.weight - 300), bolder: Math.min(900, f.weight + 300) };
    const m = /^([+-])(\d+)$/.exec(val);
    out = f.modify({ weight: m ? Math.max(100, Math.min(900, f.weight + (m[1] === "-" ? -1 : 1) * +m[2])) : map[val] ?? (toNum(val) || f.weight) });
  }
  st(this)?.fonts.add(out);
  return out;
};
const font_url: F = function (v) {
  const f = fontOf(v); if (!f || !f.google) return "";
  st(this)?.fonts.add(f);
  return googleCssUrl(f.google, [[f.weight, f.style === "italic"]]);
};

/* ------------------------------------------------------------------ Liens et objets de la boutique */

const link_to: F = (text, url, ...args) => { const { pos, named } = split(args); return `<a href="${esc(url)}"${attrs({ title: pos[0], ...named })}>${toStr(text)}</a>`; };
const rootOf = (c: Ctx) => st(c)?.rootUrl ?? "/";
const url_for_vendor: F = function (v) { return `${rootOf(this)}collections/vendors?q=${encodeURIComponent(toStr(v))}`; };
const url_for_type: F = function (v) { return `${rootOf(this)}collections/types?q=${encodeURIComponent(toStr(v))}`; };
const link_to_vendor: F = function (v) { return `<a href="${esc(url_for_vendor.call(this, v))}" title="${esc(v)}">${esc(v)}</a>`; };
const link_to_type: F = function (v) { return `<a href="${esc(url_for_type.call(this, v))}" title="${esc(v)}">${esc(v)}</a>`; };
const tagUrl = (c: Ctx, tags: string[]) => {
  const s = st(c);
  const base = s?.data.collection ? s.data.collection.url : `${rootOf(c)}collections/all`;
  return tags.length ? `${base}/${tags.map(handleize).join("+")}` : base;
};
const link_to_tag: F = function (v) { const tag = toStr(v); return `<a href="${esc(tagUrl(this, [tag]))}" title="Show products matching tag ${esc(tag)}">${esc(tag)}</a>`; };
const link_to_add_tag: F = function (v) { const tag = toStr(v); const cur = st(this)?.data.current_tags ?? []; return `<a href="${esc(tagUrl(this, [...new Set([...cur, tag])]))}" title="Show products matching tag ${esc(tag)}">${esc(tag)}</a>`; };
const link_to_remove_tag: F = function (v) { const tag = toStr(v); const cur = (st(this)?.data.current_tags ?? []).filter((x) => x !== tag); return `<a href="${esc(tagUrl(this, cur))}" title="Remove tag ${esc(tag)}">${esc(tag)}</a>`; };
const customer_login_link: F = function (text) { return `<a href="${esc(st(this)?.data.routes.account_login_url ?? "/account/login")}" id="customer_login_link">${toStr(text)}</a>`; };
const customer_logout_link: F = function (text) { return `<a href="${esc(st(this)?.data.routes.account_logout_url ?? "/account/logout")}" id="customer_logout_link">${toStr(text)}</a>`; };
const customer_register_link: F = function (text) { return `<a href="${esc(st(this)?.data.routes.account_register_url ?? "/account/register")}" id="customer_register_link">${toStr(text)}</a>`; };

const item_count_for_variant: F = function (cart, variantId) {
  const items = (cart as { items?: Array<{ variant_id: string; quantity: number }> })?.items ?? st(this)?.data.cart.items ?? [];
  const id = toStr(variantId);
  return items.filter((i) => toStr(i.variant_id) === id).reduce((n, i) => n + toNum(i.quantity), 0);
};
const line_items_for: F = function (cart, obj) {
  const items = (cart as { items?: Array<{ variant_id: string; product_id: string }> })?.items ?? [];
  const o = obj as { id?: string; product_id?: string; variants?: unknown } | null;
  if (!o?.id) return [];
  return o.variants ? items.filter((i) => toStr(i.product_id) === toStr(o.id)) : items.filter((i) => toStr(i.variant_id) === toStr(o.id));
};
const weight_with_unit: F = (v, unit) => { const n = toNum(v); const u = toStr(unit) || "kg"; return `${u === "g" || u === "oz" ? Math.round(n) : Math.round(n * 100) / 100} ${u}`; };
const format_address: F = (a) => {
  const o = (a ?? {}) as Record<string, unknown>;
  const lines = [o.name ?? [o.first_name, o.last_name].filter(Boolean).join(" "), o.company, o.address1, o.address2, [o.zip, o.city].filter(Boolean).join(" "), o.province, o.country ?? o.country_name].map(toStr).filter(Boolean);
  return `<p>${lines.map(esc).join("<br>")}</p>`;
};
const default_errors: F = (errors) => {
  const e = errors as { messages?: Record<string, string>; full_messages?: string[] } | null;
  if (!e) return "";
  const list = e.full_messages ?? (Array.isArray(e) ? (e as string[]) : Object.values(e.messages ?? {}));
  return list.length ? `<div class="errors"><ul>${list.map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div>` : "";
};
const default_pagination: F = (p, ...args) => {
  const { named } = split(args);
  const pg = p as { parts?: Array<{ title: string; url: string; is_link: boolean }>; previous?: { url: string } | null; next?: { url: string } | null } | null;
  if (!pg?.parts) return "";
  const out: string[] = [];
  if (pg.previous) out.push(`<span class="prev"><a href="${esc(pg.previous.url)}">${toStr(named.previous ?? "&laquo; Previous")}</a></span>`);
  for (const part of pg.parts) out.push(part.is_link ? `<span class="page"><a href="${esc(part.url)}">${esc(part.title)}</a></span>` : part.title === "…" || part.title === "&hellip;" ? `<span class="deco">${part.title}</span>` : `<span class="page current">${esc(part.title)}</span>`);
  if (pg.next) out.push(`<span class="next"><a href="${esc(pg.next.url)}">${toStr(named.next ?? "Next &raquo;")}</a></span>`);
  return out.join(" ");
};
const payment_type_svg_tag: F = (type, ...args) => `<svg class="${esc(split(args).named.class ?? "payment-icon")}" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="pi-${esc(type)}" viewBox="0 0 38 24" width="38" height="24"><title id="pi-${esc(type)}">${esc(type)}</title><rect width="38" height="24" rx="3" fill="#eee"/><text x="19" y="15" font-size="7" text-anchor="middle" fill="#555">${esc(toStr(type).slice(0, 8))}</text></svg>`;
const payment_type_img_url: F = () => "";
const payment_button: F = () => "";
const payment_terms: F = () => "";
const login_button: F = () => "";
const currency_selector: F = () => "";
const unit_price_with_measurement: F = () => "";
const avatar: F = (c) => { const o = c as { first_name?: string; last_name?: string; name?: string } | null; const initials = [o?.first_name?.[0], o?.last_name?.[0]].filter(Boolean).join("") || toStr(o?.name).slice(0, 1); return `<span class="avatar" aria-hidden="true">${esc(initials)}</span>`; };
const class_list: F = (v) => { if (Array.isArray(v)) return v.map(toStr).filter(Boolean).join(" "); const o = v as Record<string, unknown> | null; return o && typeof o === "object" ? Object.keys(o).filter((k) => o[k]).join(" ") : toStr(v); };
const metafield_text: F = (m) => { const o = m as { value?: unknown } | null; return o && typeof o === "object" && "value" in o ? toStr(o.value) : toStr(m); };
const metafield_tag: F = (m) => { const o = m as { value?: unknown; type?: string } | null; if (!o || typeof o !== "object") return toStr(m); const v = toStr(o.value); return o.type === "url" ? `<a href="${esc(v)}">${esc(v)}</a>` : o.type?.includes("rich_text") ? v : `<span class="metafield-${esc(o.type ?? "text")}">${esc(v)}</span>`; };

/* ------------------------------------------------------------------ Médias */

const external_video_url: F = (media, ...args) => {
  const m = media as { host?: string; external_id?: string; type?: string; id?: string } | null;
  const { named } = split(args);
  const qs = Object.entries(named).map(([k, v]) => `${k}=${encodeURIComponent(toStr(v))}`).join("&");
  const host = m?.host ?? m?.type, id = m?.external_id ?? m?.id;
  if (!id) return "";
  const base = host === "vimeo" ? `https://player.vimeo.com/video/${id}` : `https://www.youtube.com/embed/${id}`;
  return qs ? `${base}?${qs}` : base;
};
const external_video_tag: F = function (media, ...args) {
  const src = external_video_url.call(this, media, ...args) as string;
  if (!src) return "";
  const { named } = split(args);
  return `<iframe src="${esc(src)}"${attrs({ class: named.class, title: named.title, loading: named.loading })} frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
};
const video_tag: F = (media, ...args) => {
  const m = media as { sources?: Array<{ url: string; mime_type: string }>; preview_image?: ShopifyImage | null; alt?: string } | null;
  const { named } = split(args);
  const sources = m?.sources ?? [];
  if (!sources.length) return "";
  const poster = named.image_size || m?.preview_image ? m?.preview_image?.src : undefined;
  return `<video${attrs({ class: named.class, poster, autoplay: !!named.autoplay, loop: !!named.loop, muted: !!named.muted, controls: !!named.controls, playsinline: !!named.playsinline, preload: named.preload })}>${sources.map((s) => `<source src="${esc(s.url)}" type="${esc(s.mime_type)}">`).join("")}</video>`;
};
const model_viewer_tag: F = (media, ...args) => {
  const m = media as { sources?: Array<{ url: string; format: string }>; preview_image?: ShopifyImage | null; alt?: string } | null;
  const src = m?.sources?.find((s) => s.format === "glb")?.url ?? m?.sources?.[0]?.url;
  if (!src) return "";
  const { named } = split(args);
  return `<model-viewer src="${esc(src)}"${attrs({ class: named.class, poster: m?.preview_image?.src, alt: m?.alt, "camera-controls": true, "data-shopify-feature": "1.12" })}></model-viewer>`;
};
const media_tag: F = function (media, ...args) {
  const m = media as { media_type?: string } | null;
  if (!m) return "";
  if (m.media_type === "video") return video_tag.call(this, media, ...args);
  if (m.media_type === "external_video") return external_video_tag.call(this, media, ...args);
  if (m.media_type === "model") return model_viewer_tag.call(this, media, ...args);
  return image_tag.call(this, media, ...args);
};

/* ------------------------------------------------------------------ Données structurées */

const structured_data: F = function (obj) {
  const s = st(this);
  const o = obj as Partial<ShopifyProduct> & { published_at?: string; author?: string; excerpt?: string; content?: string; image?: ShopifyImage | null } | null;
  if (!o || typeof o !== "object") return "";
  const origin = s?.data.request?.origin ?? "";
  if (Array.isArray(o.variants)) {
    const p = o as ShopifyProduct;
    const data = {
      "@context": "https://schema.org", "@type": "Product", name: p.title, url: origin + p.url, description: stripHtml(p.description), brand: p.vendor ? { "@type": "Brand", name: p.vendor } : undefined,
      image: p.images?.map((i) => i.src), sku: p.selected_or_first_available_variant?.sku || undefined,
      offers: p.variants.map((v: ShopifyVariant) => ({ "@type": "Offer", price: (v.price / 100).toFixed(2), priceCurrency: s?.data.money.currency ?? "EUR", availability: v.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: origin + (v.url || p.url), sku: v.sku || undefined })),
    };
    return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  }
  if (o.published_at !== undefined && o.author !== undefined) {
    const data = { "@context": "https://schema.org", "@type": "Article", headline: o.title, url: origin + (o.url ?? ""), datePublished: o.published_at, author: { "@type": "Person", name: o.author }, image: o.image?.src, description: stripHtml(o.excerpt ?? o.content ?? "") };
    return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  }
  return "";
};

/* ------------------------------------------------------------------ Enregistrement */

export const shopifyFilters: Record<string, F> = {
  image_url, img_url, image_tag, placeholder_svg_tag, article_img_url: img_url, collection_img_url: img_url, product_img_url: img_url,
  asset_url, asset_img_url, inline_asset_content, stylesheet_tag, script_tag, preload_tag, shopify_asset_url, global_asset_url, file_url, file_img_url,
  t, translate: t, money, money_with_currency, money_without_trailing_zeros, money_without_currency, date, time_tag,
  escape, h: escape, escape_once, handle, handleize: handle, camelcase, url_encode, url_escape, url_param_escape, strip_html, newline_to_br, highlight, pluralize, split: splitF, format_code, md,
  base64_encode, base64_decode, base64_url_safe_encode, base64_url_safe_decode, md5, sha1, sha256, hmac_sha1, hmac_sha256,
  plus, minus, times, modulo, abs, ceil, floor, at_least, at_most, round, divided_by, sum,
  default: defaultF, json, where, sort_by, within,
  color_to_rgb, color_to_hex, color_to_hsl, color_extract, color_brightness, color_modify, color_lighten, color_darken, color_saturate, color_desaturate, color_mix, color_contrast, color_difference, brightness_difference, hex_to_rgba,
  font_face, font_modify, font_url,
  link_to, url_for_vendor, url_for_type, link_to_vendor, link_to_type, link_to_tag, link_to_add_tag, link_to_remove_tag, customer_login_link, customer_logout_link, customer_register_link,
  item_count_for_variant, line_items_for, weight_with_unit, format_address, default_errors, default_pagination, payment_type_svg_tag, payment_type_img_url, payment_button, payment_terms, login_button,
  currency_selector, unit_price_with_measurement, avatar, class_list, metafield_text, metafield_tag,
  external_video_url, external_video_tag, video_tag, model_viewer_tag, media_tag, structured_data,
};

export function registerFilters(liquid: Liquid) {
  for (const [name, fn] of Object.entries(shopifyFilters)) liquid.registerFilter(name, fn as unknown as FilterImplOptions);
}
