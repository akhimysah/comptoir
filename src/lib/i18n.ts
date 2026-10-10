/** Langues de la vitrine. Le français est la langue de référence : toute clé existe d'abord en français. */
export const LOCALES = { fr: "Français", en: "English" } as const;
export type Locale = keyof typeof LOCALES;
export const isLocale = (x: unknown): x is Locale => typeof x === "string" && x in LOCALES;

/** Locale Intl pour les nombres, montants et dates. */
export const intlLocale = (l: Locale) => (l === "en" ? "en-GB" : "fr-FR");

/**
 * Dictionnaire bilingue d'un composant : l'anglais doit reprendre exactement les clés du français
 * (le compilateur signale toute traduction manquante).
 */
export function dict<T extends Record<string, unknown>>(fr: T, en: { [K in keyof T]: T[K] }) {
  return { fr, en } as Record<Locale, T>;
}

/** Contenu saisi par le marchand : JSON { en: { title: "…" } } ; un champ vide garde le texte d'origine. */
export type Translations = Partial<Record<Locale, Record<string, string>>>;

export function readTranslations(json: string | null | undefined): Translations {
  try {
    const v = JSON.parse(json || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Copie de l'objet avec ses champs traduits dans la langue demandée (s'ils ont été traduits). */
export function translate<T extends { translations?: string }>(entity: T, locale: Locale, fields: (keyof T & string)[]): T {
  if (locale === "fr" || !entity.translations) return entity;
  const t = readTranslations(entity.translations)[locale];
  if (!t) return entity;
  const out = { ...entity };
  for (const f of fields) if (typeof t[f] === "string" && t[f].trim()) (out as Record<string, unknown>)[f] = t[f];
  return out;
}
