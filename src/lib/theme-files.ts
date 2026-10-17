import "server-only";
import type { Store } from "@prisma/client";
import { isImageUrl } from "./images";
import { readTranslations } from "./i18n";
import { CUSTOM_CSS_MAX, sanitizeCss } from "./custom-css";
import { readTheme, themeSchema, type Theme } from "./theme";

/** Thème reçu (éditeur ou dépôt GitHub) : validé comme dans l'éditeur. */
export function parseThemeJson(json: string): { theme: Theme } | { error: string } {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return { error: "Thème illisible (JSON invalide)." }; }
  const parsed = themeSchema.safeParse(raw);
  if (!parsed.success) return { error: `Thème invalide : ${parsed.error.issues[0].path.join(".")} ${parsed.error.issues[0].message}` };
  for (const s of parsed.data.sections) if ("image" in s && s.image && !isImageUrl(s.image)) return { error: "Une image du thème n'est pas valide." };
  return { theme: parsed.data };
}

/** Fichiers du thème tels qu'ils sont rangés dans le dépôt. */
export const THEME_FILES = { theme: "theme.json", css: "custom.css", en: "locales/en.json" } as const;

export function themeFiles(store: Pick<Store, "theme" | "name" | "customCss" | "translations">): Record<string, string> {
  return {
    [THEME_FILES.theme]: `${JSON.stringify(readTheme(store.theme, store.name), null, 2)}\n`,
    [THEME_FILES.css]: store.customCss ? `${store.customCss.trimEnd()}\n` : "",
    [THEME_FILES.en]: `${JSON.stringify(readTranslations(store.translations).en ?? {}, null, 2)}\n`,
  };
}

/** Fichiers lus dans le dépôt → mise à jour de la boutique (chaque fichier est vérifié ; un fichier absent ne change rien). */
export function storeUpdateFromFiles(store: Pick<Store, "translations">, files: Partial<Record<string, string>>): { data: { theme?: string; customCss?: string; translations?: string }; error?: string } {
  const data: { theme?: string; customCss?: string; translations?: string } = {};
  const themeJson = files[THEME_FILES.theme];
  if (themeJson !== undefined) {
    const parsed = parseThemeJson(themeJson);
    if ("error" in parsed) return { data: {}, error: `${THEME_FILES.theme} : ${parsed.error}` };
    data.theme = JSON.stringify(parsed.theme);
  }
  const css = files[THEME_FILES.css];
  if (css !== undefined) {
    if (css.length > CUSTOM_CSS_MAX) return { data: {}, error: `${THEME_FILES.css} : trop long (${CUSTOM_CSS_MAX} caractères maximum).` };
    data.customCss = sanitizeCss(css.trim());
  }
  const en = files[THEME_FILES.en];
  if (en !== undefined) {
    let parsed: unknown;
    try { parsed = JSON.parse(en); } catch { return { data: {}, error: `${THEME_FILES.en} : JSON invalide.` }; }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { data: {}, error: `${THEME_FILES.en} : un objet { "clé": "texte" } est attendu.` };
    const clean = Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === "string").map(([k, v]) => [k.slice(0, 200), (v as string).slice(0, 2000)]));
    const t = readTranslations(store.translations);
    data.translations = JSON.stringify({ ...t, en: clean });
  }
  return { data };
}
