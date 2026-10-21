"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { requirePerm } from "@/lib/auth";
import { CUSTOM_CSS_MAX, sanitizeCss } from "@/lib/custom-css";
import { db } from "@/lib/db";
import { pushThemeLater } from "@/lib/github";
import { defaultTheme } from "@/lib/theme";
import { parseThemeJson, storeUpdateFromFiles, THEME_FILES } from "@/lib/theme-files";
import { installPlatformTheme, isTextPath, putThemeFiles, themePath } from "@/lib/liquid/source";
import { liquidEditorData, type SchemaSetting, type TemplateJson } from "@/lib/liquid/editor-data";
import { recordRevision, restoreRevision } from "@/lib/theme-revisions";
import { createTheme, duplicateTheme, ownTheme, publishTheme, saveThemeRow, themeFromPreset, uniqueThemeName } from "@/lib/themes";

const refresh = (slug: string) => { revalidatePath("/admin/theme"); revalidatePath(`/s/${slug}`, "layout"); };
const back = (kind: "ok" | "err", msg: string) => redirect(`/admin/theme?${kind}=${encodeURIComponent(msg)}`);

/** Éditeur : enregistre le thème (la vitrine suit s'il est publié). */
export async function saveTheme(themeId: string, json: string): Promise<{ error?: string; ok?: boolean }> {
  const { store, user } = await requirePerm("content");
  const theme = await ownTheme(store.id, themeId);
  if (!theme) return { error: "Thème introuvable." };
  const parsed = parseThemeJson(json);
  if ("error" in parsed) return { error: parsed.error };
  await recordRevision(theme, store.name, "Enregistrement depuis l'éditeur", [THEME_FILES.theme], user.name);
  await saveThemeRow(store, themeId, { theme: JSON.stringify(parsed.theme) });
  await logActivity(store.publishedThemeId === themeId ? "Thème publié modifié" : "Brouillon de thème enregistré", `/admin/theme/${themeId}`);
  await pushThemeLater(themeId, "Thème modifié depuis l'admin");
  refresh(store.slug);
  return { ok: true };
}

/** « + Nouveau » : brouillon vierge, ouvert dans l'éditeur. */
export async function newTheme() {
  const { store } = await requirePerm("content");
  const row = await createTheme(store.id, { name: await uniqueThemeName(store.id, "Nouveau thème"), theme: defaultTheme(store.name, store.tagline) });
  await logActivity(`Thème « ${row.name} » créé`, `/admin/theme/${row.id}`);
  redirect(`/admin/theme/${row.id}`);
}

/** « Ajouter » un thème Shopify de la bibliothèque de la plateforme : copie complète dans les brouillons. */
export async function addPlatformTheme(form: FormData) {
  const { store } = await requirePerm("content");
  const t = await db.platformTheme.findFirst({ where: { id: String(form.get("id") ?? ""), ready: true } });
  if (!t) back("err", "Thème introuvable.");
  if ((await db.storeTheme.count({ where: { storeId: store.id } })) >= 20) back("err", "20 thèmes au maximum dans la bibliothèque : supprimez-en un d'abord.");
  const row = await installPlatformTheme(store.id, t!.id, await uniqueThemeName(store.id, t!.name));
  await logActivity(`Thème Shopify « ${row.name} » ajouté depuis la galerie`, `/admin/theme/${row.id}`);
  revalidatePath("/admin/theme");
  back("ok", `« ${row.name} » ajouté à vos brouillons.`);
}

/** « Ajouter » dans la galerie : brouillon créé depuis un modèle. */
export async function addPresetTheme(form: FormData) {
  const { store } = await requirePerm("content");
  const key = String(form.get("preset") ?? "");
  const theme = themeFromPreset(key, store);
  if (!theme) back("err", "Modèle introuvable.");
  const label = key.charAt(0).toUpperCase() + key.slice(1);
  const row = await createTheme(store.id, { name: await uniqueThemeName(store.id, label), theme: theme!, source: "preset" });
  await logActivity(`Thème « ${row.name} » ajouté depuis la galerie`, `/admin/theme/${row.id}`);
  revalidatePath("/admin/theme");
  back("ok", `« ${row.name} » ajouté à vos brouillons.`);
}

export async function publish(form: FormData) {
  const { store } = await requirePerm("content");
  const row = await publishTheme(store, String(form.get("id") ?? ""));
  if (!row) back("err", "Thème introuvable.");
  await logActivity(`Thème « ${row!.name} » publié`, "/admin/theme");
  refresh(store.slug);
  back("ok", `« ${row!.name} » est maintenant le thème de votre boutique.`);
}

export async function rename(form: FormData) {
  const { store } = await requirePerm("content");
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  if (!name || !(await ownTheme(store.id, id))) return;
  await db.storeTheme.update({ where: { id }, data: { name } });
  revalidatePath("/admin/theme");
}

export async function duplicate(form: FormData) {
  const { store } = await requirePerm("content");
  const row = await duplicateTheme(store.id, String(form.get("id") ?? ""));
  if (!row) back("err", "Thème introuvable.");
  revalidatePath("/admin/theme");
  back("ok", `« ${row!.name} » ajouté à vos brouillons.`);
}

/** Suppression d'un brouillon (jamais du thème publié). */
export async function remove(form: FormData) {
  const { store } = await requirePerm("content");
  const id = String(form.get("id") ?? "");
  if (id === store.publishedThemeId) back("err", "Le thème publié ne peut pas être supprimé : publiez-en un autre d'abord.");
  const row = await ownTheme(store.id, id);
  if (!row) back("err", "Thème introuvable.");
  await db.storeTheme.delete({ where: { id } });
  await logActivity(`Thème « ${row!.name} » supprimé`, "/admin/theme");
  revalidatePath("/admin/theme");
  back("ok", `« ${row!.name} » supprimé.`);
}

/** « Modifier le code » : enregistre un fichier du thème (theme.json, custom.css ou locales/en.json), vérifié comme à l'import. */
export async function saveThemeFile(themeId: string, file: string, content: string): Promise<{ error?: string; ok?: boolean }> {
  const { store, user } = await requirePerm("content");
  const theme = await ownTheme(store.id, themeId);
  if (!theme) return { error: "Thème introuvable." };
  if (theme.engine === "liquid") {
    // Thème Shopify : n'importe quel fichier texte du thème ; la version change pour invalider les gabarits en cache.
    const path = themePath(file);
    if (!path || !isTextPath(path)) return { error: "Fichier inconnu." };
    if (content.length > 2_000_000) return { error: "Fichier trop long (2 Mo maximum)." };
    if (path.endsWith(".json")) { try { JSON.parse(content); } catch { return { error: "JSON invalide." }; } }
    await recordRevision(theme, store.name, `Modification de ${path} dans l'éditeur de code`, [path], user.name);
    await putThemeFiles(themeId, [{ path, data: new TextEncoder().encode(content) }]);
    await db.storeTheme.update({ where: { id: themeId }, data: { version: { increment: 1 } } });
    await logActivity(`Fichier ${path} du thème « ${theme.name} » modifié`, `/admin/theme/${themeId}/code`);
    refresh(store.slug);
    return { ok: true };
  }
  if (!(Object.values(THEME_FILES) as string[]).includes(file)) return { error: "Fichier inconnu." };
  if (content.length > 200_000) return { error: "Fichier trop long." };
  const { data, error } = storeUpdateFromFiles(theme, { [file]: content });
  if (error) return { error };
  await recordRevision(theme, store.name, `Modification de ${file} dans l'éditeur de code`, [file], user.name);
  await saveThemeRow(store, themeId, data);
  await logActivity(`Fichier ${file} du thème « ${theme.name} » modifié`, `/admin/theme/${themeId}/code`);
  await pushThemeLater(themeId, `${file} modifié depuis l'éditeur de code`);
  refresh(store.slug);
  return { ok: true };
}

/** Éditeur visuel d'un thème Shopify : enregistre des fichiers JSON (gabarits, groupes de sections, settings_data). */
export async function saveLiquidFiles(themeId: string, files: Record<string, string>): Promise<{ error?: string; ok?: boolean }> {
  const { store, user } = await requirePerm("content");
  const theme = await ownTheme(store.id, themeId);
  if (!theme || theme.engine !== "liquid") return { error: "Thème introuvable." };
  const out: { path: string; data: Uint8Array }[] = [];
  for (const [file, content] of Object.entries(files)) {
    const path = themePath(file);
    if (!path || !path.endsWith(".json") || !/^(templates|sections|config)\//.test(path)) return { error: `Fichier refusé : ${file}` };
    if (content.length > 1_000_000) return { error: "Fichier trop long." };
    try { JSON.parse(content); } catch { return { error: `JSON invalide dans ${path}.` }; }
    out.push({ path, data: new TextEncoder().encode(content) });
  }
  if (out.length) await recordRevision(theme, store.name, "Enregistrement depuis l'éditeur", out.map((f) => f.path), user.name);
  await putThemeFiles(themeId, out);
  await db.storeTheme.update({ where: { id: themeId }, data: { version: { increment: 1 } } });
  await logActivity(store.publishedThemeId === themeId ? "Thème publié modifié" : "Brouillon de thème enregistré", `/admin/theme/${themeId}`);
  refresh(store.slug);
  return { ok: true };
}

/** Visuels d'exemple livrés avec l'app (SVG abstraits, dimensions dans le nom). */
const SAMPLE_IMAGES = { landscape: [1, 2, 3, 4, 5, 6].map((i) => `/samples/scene-${i}-1600x1000.svg`), portrait: [7, 8, 9].map((i) => `/samples/portrait-${i}-1200x1500.svg`), square: [10, 11].map((i) => `/samples/square-${i}-1200x1200.svg`) };

/**
 * « Remplir avec du contenu d'exemple » : sur un thème Shopify fraîchement installé, les images vides des sections
 * et des blocs de la page d'accueil (et des groupes d'en-tête / pied de page) reçoivent des visuels d'exemple,
 * et les sections qui demandent un produit ou une collection reçoivent ceux de la boutique.
 */
export async function fillDemoContent(form: FormData) {
  const { store, user } = await requirePerm("content");
  const themeId = String(form.get("id") ?? "");
  const theme = await ownTheme(store.id, themeId);
  if (!theme || theme.engine !== "liquid") back("err", "Thème introuvable.");
  const data = await liquidEditorData(themeId);
  const [products, collections] = await Promise.all([
    db.product.findMany({ where: { storeId: store.id, status: "active" }, select: { handle: true }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.collection.findMany({ where: { storeId: store.id }, select: { handle: true }, orderBy: { title: "asc" }, take: 6 }),
  ]);
  let n = 0;
  const pick = (id: string) => { const list = /mobile|portrait|vertical/i.test(id) ? SAMPLE_IMAGES.portrait : /logo|icon|square|avatar/i.test(id) ? SAMPLE_IMAGES.square : SAMPLE_IMAGES.landscape; return list[n++ % list.length]; };
  const empty = (v: unknown) => v === undefined || v === null || v === "" || (typeof v === "string" && v.startsWith("shopify://"));
  const fill = (defs: SchemaSetting[] | undefined, settings: Record<string, unknown>) => {
    let changed = false;
    for (const d of defs ?? []) {
      if (!d.id) continue;
      const v = settings[d.id];
      if (d.type === "image_picker" && empty(v)) { settings[d.id] = pick(d.id); changed = true; }
      else if (d.type === "product" && empty(v) && products[0]) { settings[d.id] = products[0].handle; changed = true; }
      else if (d.type === "collection" && empty(v) && collections[0]) { settings[d.id] = collections[0].handle; changed = true; }
      else if (d.type === "product_list" && (!Array.isArray(v) || !v.length) && products.length) { settings[d.id] = products.slice(0, d.limit ?? 4).map((p) => p.handle); changed = true; }
      else if (d.type === "collection_list" && (!Array.isArray(v) || !v.length) && collections.length) { settings[d.id] = collections.slice(0, d.limit ?? 3).map((c) => c.handle); changed = true; }
    }
    return changed;
  };
  const docs: [string, TemplateJson][] = [["templates/index.json", data.templates.index], ...Object.entries(data.groups).map(([k, g]) => [`sections/${k}.json`, g] as [string, TemplateJson])].filter((x): x is [string, TemplateJson] => Boolean(x[1]));
  const files: { path: string; data: Uint8Array }[] = [];
  for (const [path, doc] of docs) {
    let changed = false;
    for (const sec of Object.values(doc.sections)) {
      const schema = data.sections[sec.type];
      sec.settings ??= {};
      if (fill(schema?.settings, sec.settings)) changed = true;
      for (const b of Object.values(sec.blocks ?? {})) { b.settings ??= {}; if (fill(schema?.blocks?.find((x) => x.type === b.type)?.settings, b.settings)) changed = true; }
    }
    if (changed) files.push({ path, data: new TextEncoder().encode(JSON.stringify(doc, null, 2)) });
  }
  if (files.length) {
    await recordRevision(theme!, store.name, "Contenu d'exemple ajouté", files.map((f) => f.path), user.name);
    await putThemeFiles(themeId, files);
    await db.storeTheme.update({ where: { id: themeId }, data: { version: { increment: 1 } } });
    await logActivity(`Contenu d'exemple ajouté au thème « ${theme!.name} »`, `/admin/theme/${themeId}`);
    refresh(store.slug);
  }
  redirect(`/admin/theme/${themeId}`);
}

/** Historique des versions : revenir à l'état d'avant une version. */
export async function restoreThemeRevision(form: FormData) {
  const { store, user } = await requirePerm("content");
  const themeId = String(form.get("themeId") ?? "");
  const theme = await ownTheme(store.id, themeId);
  if (!theme) back("err", "Thème introuvable.");
  const r = await restoreRevision(theme!, store.name, String(form.get("revisionId") ?? ""), user.name);
  if (r.error) redirect(`/admin/theme/${themeId}/history?err=${encodeURIComponent(r.error)}`);
  if (store.publishedThemeId === themeId && theme!.engine !== "liquid") { const row = await ownTheme(store.id, themeId); if (row) await saveThemeRow(store, themeId, { theme: row.theme, customCss: row.customCss, translations: row.translations }); }
  await logActivity(`Version précédente du thème « ${theme!.name} » restaurée`, `/admin/theme/${themeId}`);
  refresh(store.slug);
  redirect(`/admin/theme/${themeId}/history?ok=${encodeURIComponent("Version restaurée.")}`);
}

/** « Mettre à jour » depuis la bibliothèque : nouvelle version du thème de la plateforme, en brouillon, avec les réglages de l'ancien. */
export async function updateFromPlatform(form: FormData) {
  const { store } = await requirePerm("content");
  const theme = await ownTheme(store.id, String(form.get("id") ?? ""));
  if (!theme?.platformThemeId) back("err", "Thème introuvable.");
  const platform = await db.platformTheme.findFirst({ where: { id: theme!.platformThemeId!, ready: true } });
  if (!platform) back("err", "Ce thème n'est plus dans la bibliothèque de la plateforme.");
  if ((await db.storeTheme.count({ where: { storeId: store.id } })) >= 20) back("err", "20 thèmes au maximum dans la bibliothèque : supprimez-en un d'abord.");
  const row = await installPlatformTheme(store.id, platform!.id, await uniqueThemeName(store.id, `${platform!.name} ${platform!.version}`.trim()), theme!.id);
  await logActivity(`Thème « ${row.name} » : mise à jour installée en brouillon`, `/admin/theme/${row.id}`);
  revalidatePath("/admin/theme");
  back("ok", `« ${row.name} » ajouté à vos brouillons avec vos réglages. Vérifiez-le, puis publiez-le.`);
}
