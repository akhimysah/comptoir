/** Champs personnalisés des produits : définitions de la boutique et valeurs de chaque produit (JSON { clé: valeur }). */
export type MetafieldType = "text" | "multiline" | "number" | "boolean" | "choice";
export type MetafieldDef = { key: string; name: string; type: string; choices: string; unit: string; showOnProduct: boolean; filterable: boolean };

export const METAFIELD_TYPES: Record<MetafieldType, string> = {
  text: "Texte court",
  multiline: "Texte long",
  number: "Nombre",
  boolean: "Oui / non",
  choice: "Liste de choix",
};

export const choicesOf = (d: { choices: string }) => {
  try { const v = JSON.parse(d.choices); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; }
};

/** Valeur lisible : « Oui », « 12 cm », texte… ; null si vide. */
export function formatMetafield(d: MetafieldDef, raw: string | undefined, locale: "fr" | "en" = "fr") {
  if (raw === undefined || raw === "") return null;
  if (d.type === "boolean") return raw === "true" ? (locale === "en" ? "Yes" : "Oui") : raw === "false" ? (locale === "en" ? "No" : "Non") : null;
  if (d.type === "number") return `${Number(raw).toLocaleString(locale === "en" ? "en-GB" : "fr-FR")}${d.unit ? ` ${d.unit}` : ""}`;
  return `${raw}${d.unit && d.type === "text" ? ` ${d.unit}` : ""}`;
}

/** Vérifie et nettoie les valeurs saisies pour un produit (champs inconnus ignorés). */
export function cleanMetafields(defs: MetafieldDef[], input: Record<string, unknown>): { values?: Record<string, string>; error?: string } {
  const out: Record<string, string> = {};
  for (const d of defs) {
    const raw = input[d.key];
    if (raw === undefined || raw === null || raw === "") continue;
    const v = String(raw).trim();
    if (!v) continue;
    if (d.type === "number") {
      const n = Number(v.replace(",", "."));
      if (!Number.isFinite(n)) return { error: `« ${d.name} » doit être un nombre.` };
      out[d.key] = String(n);
    } else if (d.type === "boolean") {
      if (v !== "true" && v !== "false") return { error: `« ${d.name} » : valeur invalide.` };
      out[d.key] = v;
    } else if (d.type === "choice") {
      if (!choicesOf(d).includes(v)) return { error: `« ${d.name} » : choisissez une valeur de la liste.` };
      out[d.key] = v;
    } else {
      out[d.key] = v.slice(0, d.type === "multiline" ? 2000 : 200);
    }
  }
  return { values: out };
}
