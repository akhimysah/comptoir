import "server-only";
import type { Store, StoreTheme } from "@prisma/client";
import { db } from "./db";
import { defaultTheme, PRESETS, presetSections, readTheme, type Theme } from "./theme";

/**
 * Bibliothèque de thèmes (comme sur Shopify) : un thème publié et des brouillons.
 * La vitrine lit la copie du thème publié dans Store (theme, customCss, translations) : publier = copier.
 */
export type ThemeData = Pick<StoreTheme, "theme" | "customCss" | "translations">;

/** Thèmes de la boutique, le publié en premier ; crée le premier thème à partir de l'existant si besoin. */
export async function storeThemes(store: Store): Promise<{ themes: StoreTheme[]; publishedId: string }> {
  let themes = await db.storeTheme.findMany({ where: { storeId: store.id }, orderBy: { updatedAt: "desc" } });
  let publishedId = store.publishedThemeId && themes.some((t) => t.id === store.publishedThemeId) ? store.publishedThemeId : null;
  if (!publishedId) {
    // Première visite de la bibliothèque : le thème actuel de la boutique devient le thème publié.
    const row = await db.storeTheme.create({ data: { storeId: store.id, name: "Mon thème", theme: JSON.stringify(readTheme(store.theme, store.name)), customCss: store.customCss, translations: store.translations, source: "editor" } });
    await db.store.update({ where: { id: store.id }, data: { publishedThemeId: row.id } });
    publishedId = row.id;
    themes = [row, ...themes];
  }
  return { themes: themes.sort((a, b) => Number(b.id === publishedId) - Number(a.id === publishedId) || b.updatedAt.getTime() - a.updatedAt.getTime()), publishedId };
}

export async function ownTheme(storeId: string, id: string) {
  return db.storeTheme.findFirst({ where: { id, storeId } });
}

/** Enregistre un thème ; si c'est le thème publié, la vitrine suit tout de suite. */
export async function saveThemeRow(store: Pick<Store, "id" | "publishedThemeId">, id: string, data: Partial<ThemeData>) {
  const row = await db.storeTheme.update({ where: { id }, data });
  if (store.publishedThemeId === id) await db.store.update({ where: { id: store.id }, data: { ...data, themeUpdatedAt: new Date() } });
  return row;
}

/** Publie un brouillon : ses fichiers deviennent ceux de la vitrine. */
export async function publishTheme(store: Store, id: string) {
  const row = await ownTheme(store.id, id);
  if (!row) return null;
  await db.$transaction([
    db.store.update({ where: { id: store.id }, data: { theme: row.theme, customCss: row.customCss, translations: row.translations, publishedThemeId: row.id, themeUpdatedAt: new Date() } }),
    db.storeTheme.update({ where: { id: row.id }, data: { updatedAt: new Date() } }),
  ]);
  return row;
}

export async function createTheme(storeId: string, input: { name: string; theme: Theme | string; customCss?: string; translations?: string; source?: string } & Partial<Pick<StoreTheme, "githubRepo" | "githubBranch" | "githubPath" | "githubToken" | "githubWebhookSecret">>) {
  const { theme, ...rest } = input;
  return db.storeTheme.create({ data: { storeId, ...rest, theme: typeof theme === "string" ? theme : JSON.stringify(theme), customCss: input.customCss ?? "", translations: input.translations ?? "{}", source: input.source ?? "editor" } });
}

/** Copie d'un thème (sans sa liaison GitHub). */
export async function duplicateTheme(storeId: string, id: string) {
  const row = await ownTheme(storeId, id);
  if (!row) return null;
  return createTheme(storeId, { name: `Copie de ${row.name}`.slice(0, 60), theme: row.theme, customCss: row.customCss, translations: row.translations, source: "copy" });
}

/** Nouveau brouillon depuis un modèle de la galerie « Découvrir des thèmes ». */
export function themeFromPreset(key: string, store: Pick<Store, "name" | "tagline">): Theme | null {
  const p = PRESETS[key];
  if (!p) return null;
  return { ...defaultTheme(store.name, store.tagline), colors: p.colors, font: p.font, radius: p.radius, sections: presetSections(key, store.name, store.tagline) };
}

/** Nom libre dans la bibliothèque (« Horizon », puis « Horizon 2 »…). */
export async function uniqueThemeName(storeId: string, base: string) {
  const names = new Set((await db.storeTheme.findMany({ where: { storeId }, select: { name: true } })).map((t) => t.name));
  let name = base.slice(0, 60);
  for (let i = 2; names.has(name); i++) name = `${base.slice(0, 55)} ${i}`;
  return name;
}
