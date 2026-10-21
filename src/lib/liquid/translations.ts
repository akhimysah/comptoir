/**
 * Traductions du thème : locales/<langue>.json par-dessus locales/<langue>.default.json puis en.default.json.
 * Le filtre `t` gère les variables {{ name }}, la pluralisation (zero/one/other) et les clés `_html`.
 */
import { toNum, toStr } from "./drops";
import type { ThemeSource } from "./types";

export type Dict = Record<string, unknown>;

function deepMerge(base: Dict, over: Dict): Dict {
  const out: Dict = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] = v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object" && !Array.isArray(b) ? deepMerge(b as Dict, v as Dict) : v;
  }
  return out;
}

async function readJson(source: ThemeSource, path: string): Promise<Dict | null> {
  const text = await source.get(path);
  if (!text) return null;
  try {
    return JSON.parse(text.replace(/^﻿/, "")) as Dict;
  } catch {
    return null;
  }
}

/** Dictionnaire fusionné pour une langue ("fr", "fr-CA"…). Cherche aussi la langue courte ("fr" pour "fr-CA"). */
export async function loadTranslations(source: ThemeSource, locale: string): Promise<Dict> {
  const files = await source.list("locales/");
  const names = new Set(files.map((f) => f.replace(/^locales\//, "")));
  const short = locale.split("-")[0];
  const layers: string[] = [];
  const defaultFile = [...names].find((n) => n.endsWith(".default.json") && !n.includes(".schema."));
  if (defaultFile) layers.push(defaultFile);
  for (const cand of [`${short}.default.json`, `${short}.json`, `${locale}.default.json`, `${locale}.json`]) {
    if (names.has(cand) && !layers.includes(cand)) layers.push(cand);
  }
  // Fichiers « fr-FR.json » quand on demande « fr ».
  const regional = [...names].find((n) => n.toLowerCase().startsWith(`${short.toLowerCase()}-`) && !n.includes(".schema.") && !n.endsWith(".default.json"));
  if (regional && !layers.some((l) => l.startsWith(`${short}.`) || l.startsWith(`${locale}.`))) layers.push(regional);
  let dict: Dict = {};
  for (const file of layers) {
    const json = await readJson(source, `locales/${file}`);
    if (json) dict = deepMerge(dict, json);
  }
  return dict;
}

export function lookup(dict: Dict, key: string): unknown {
  let cur: unknown = dict;
  for (const part of key.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Dict)[part];
  }
  return cur;
}

function interpolate(text: string, vars: Record<string, unknown>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (m, name: string) => (name in vars ? toStr(vars[name]) : m));
}

/** Traduit une clé ; `vars.count` choisit zero/one/other. Clé absente → la clé elle-même (plus lisible que « Translation missing »). */
export function translate(dict: Dict, key: string, vars: Record<string, unknown> = {}): string {
  const k = toStr(key);
  let value = lookup(dict, k);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const forms = value as Dict;
    if ("count" in vars) {
      const n = toNum(vars.count);
      value = (n === 0 && forms.zero) || (n === 1 && forms.one) || (n === 2 && forms.two) || forms.other || forms.one || forms.zero;
    } else {
      value = forms.other ?? forms.one ?? Object.values(forms).find((v) => typeof v === "string");
    }
  }
  if (typeof value !== "string") return k;
  return interpolate(value, vars);
}

/** Format de date nommé défini par le thème (clé `date_formats.<nom>` du fichier de langue). */
export function dateFormatFromLocale(dict: Dict, name: string): string | undefined {
  const v = lookup(dict, `date_formats.${name}`);
  return typeof v === "string" ? v : undefined;
}
