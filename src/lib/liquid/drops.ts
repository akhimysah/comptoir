/**
 * Objets Liquid « drops » : valeurs qui se comportent comme des chaînes dans les comparaisons et les sorties,
 * mais exposent des propriétés (couleur, police, gabarit, collections indexables par handle…).
 * liquidjs appelle `valueOf()` d'un Drop pour les comparaisons/sorties et lit les propriétés directement.
 */
import { Drop } from "liquidjs";
import type { ShopifyCollection, ShopifyImage, ShopifyProduct } from "./types";

/* ------------------------------------------------------------------ Couleurs */

export type Rgba = { r: number; g: number; b: number; a: number };

const NAMED: Record<string, string> = { white: "#ffffff", black: "#000000", transparent: "rgba(0,0,0,0)", red: "#ff0000", blue: "#0000ff", green: "#008000", gray: "#808080", grey: "#808080" };

/** Analyse "#rgb", "#rrggbb", "#rrggbbaa", "rgb()", "rgba()", "hsl()" ; null si ce n'est pas une couleur. */
export function parseColor(input: unknown): Rgba | null {
  if (input instanceof ColorDrop) return { ...input.c };
  if (typeof input !== "string") return null;
  let s = input.trim().toLowerCase();
  if (NAMED[s]) s = NAMED[s];
  let m = /^#([0-9a-f]{3,4})$/.exec(s);
  if (m) {
    const h = m[1];
    return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16), a: h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1 };
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
  m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : +m[4] };
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%(?:[,\s/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (m) return { ...hslToRgb(+m[1], +m[2], +m[3]), a: m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : +m[4] };
  return null;
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360; s = Math.min(100, Math.max(0, s)) / 100; l = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");

/** Couleur Shopify : s'affiche comme "#rrggbb" (ou rgba() si transparente) et expose .red .green .blue .alpha .hue… */
export class ColorDrop extends Drop {
  readonly c: Rgba;
  constructor(c: Rgba) {
    super();
    this.c = c;
  }
  get red() { return Math.round(this.c.r); }
  get green() { return Math.round(this.c.g); }
  get blue() { return Math.round(this.c.b); }
  get alpha() { return this.c.a; }
  get hue() { return Math.round(rgbToHsl(this.c.r, this.c.g, this.c.b).h); }
  get saturation() { return Math.round(rgbToHsl(this.c.r, this.c.g, this.c.b).s); }
  get lightness() { return Math.round(rgbToHsl(this.c.r, this.c.g, this.c.b).l); }
  // Comme sur Shopify, .rgb et .rgba donnent les composantes seules ("240, 240, 240") : les thèmes écrivent rgb(var(--x)).
  get rgb() { return `${this.red}, ${this.green}, ${this.blue}`; }
  get rgba() { return `${this.red}, ${this.green}, ${this.blue}, ${this.c.a}`; }
  get hex() { return `#${hex2(this.c.r)}${hex2(this.c.g)}${hex2(this.c.b)}`; }
  /** Les objets vides de Shopify ont `size` ; une couleur a la longueur de sa chaîne (utile pour `!= blank`). */
  get size() { return this.toString().length; }
  toString() { return this.c.a >= 1 ? this.hex : `rgba(${this.rgba})`; }
  valueOf() { return this.toString(); }
  toJSON() { return this.toString(); }
}

export function toColorDrop(value: unknown): ColorDrop | null {
  const c = parseColor(value);
  return c ? new ColorDrop(c) : null;
}

/* ------------------------------------------------------------------ Gabarit */

/** `template` : comparable à une chaîne ("index", "product.alt") et porteur de .name .suffix .directory. */
export class TemplateDrop extends Drop {
  readonly name: string;
  readonly suffix: string;
  readonly directory: string;
  constructor(name: string, suffix = "") {
    super();
    const parts = name.split("/");
    this.name = parts[parts.length - 1];
    this.directory = parts.length > 1 ? parts[0] : "";
    this.suffix = suffix;
  }
  get size() { return this.toString().length; }
  toString() { return this.suffix ? `${this.name}.${this.suffix}` : this.name; }
  valueOf() { return this.toString(); }
  toJSON() { return this.toString(); }
}

/* ------------------------------------------------------------------ Tableaux indexables par handle */

/** Tableau de collections indexable par handle : `collections['frontpage']`, `collections.all`, boucles `for`. */
export function handleIndexed<T extends { handle: string }>(items: T[], fallback?: (handle: string) => T | undefined): T[] {
  return new Proxy(items, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && !(prop in target)) {
        const found = target.find((x) => x.handle === prop);
        return found ?? fallback?.(prop);
      }
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      return prop in target || (typeof prop === "string" && target.some((x) => x.handle === prop));
    },
  });
}

/** La collection virtuelle « all » (tous les produits), comme sur Shopify quand elle n'existe pas. */
export function allCollection(products: ShopifyProduct[], rootUrl: string): ShopifyCollection {
  return {
    id: "all", title: "Products", handle: "all", url: `${rootUrl}collections/all`, image: null, products_count: products.length, description: "",
    products, all_products_count: products.length, all_tags: [...new Set(products.flatMap((p) => p.tags))], all_types: [...new Set(products.map((p) => p.type).filter(Boolean))],
    all_vendors: [...new Set(products.map((p) => p.vendor).filter(Boolean))], sort_by: "", default_sort_by: "manual", sort_options: [], current_type: null, current_vendor: null,
    template_suffix: "", featured_image: products[0]?.featured_image ?? null, filters: [],
  };
}

/** Image d'un fichier du thème (images['logo.png']) : adresse publique, dimensions inconnues. */
export function assetImage(name: string, src: string): ShopifyImage {
  return { id: name, src, alt: "", width: 0, height: 0, aspect_ratio: 0, media_type: "image" };
}

/** `product.options_by_name['Color']` doit être insensible à la casse comme sur Shopify. */
export function caseInsensitive<T>(record: Record<string, T>): Record<string, T> {
  return new Proxy(record, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && !(prop in target)) {
        const key = Object.keys(target).find((k) => k.toLowerCase() === prop.toLowerCase());
        if (key) return target[key];
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/* ------------------------------------------------------------------ Divers */

/** Conversion « à la Shopify » d'une valeur en nombre : "12px" → 12, nil → 0, "abc" → 0. */
export function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (v instanceof Drop) v = v.valueOf();
  if (typeof v === "boolean" || v == null) return 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** Chaîne « à la Shopify » : nil → "", tableaux concaténés, drops via valueOf. */
export function toStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (v instanceof Drop) return toStr(v.valueOf());
  if (Array.isArray(v)) return v.map(toStr).join("");
  if (typeof v === "object" && !(v instanceof Date)) return "";
  return String(v);
}

/** Métachamp Shopify : s'affiche comme sa valeur formatée, expose .value .type .namespace .key. */
export class MetafieldDrop extends Drop {
  constructor(public value: unknown, public type: string, public namespace: string, public key: string, private text: string) { super(); }
  valueOf() { return this.text; }
  toString() { return this.text; }
  toJSON() { return this.value; }
  get list() { return Array.isArray(this.value) ? this.value : [this.value]; }
}
