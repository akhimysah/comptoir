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
import { createTheme, duplicateTheme, ownTheme, publishTheme, saveThemeRow, themeFromPreset, uniqueThemeName } from "@/lib/themes";

const refresh = (slug: string) => { revalidatePath("/admin/theme"); revalidatePath(`/s/${slug}`, "layout"); };
const back = (kind: "ok" | "err", msg: string) => redirect(`/admin/theme?${kind}=${encodeURIComponent(msg)}`);

/** Éditeur : enregistre le thème (la vitrine suit s'il est publié). */
export async function saveTheme(themeId: string, json: string): Promise<{ error?: string; ok?: boolean }> {
  const { store } = await requirePerm("content");
  if (!(await ownTheme(store.id, themeId))) return { error: "Thème introuvable." };
  const parsed = parseThemeJson(json);
  if ("error" in parsed) return { error: parsed.error };
  await saveThemeRow(store, themeId, { theme: JSON.stringify(parsed.theme) });
  await logActivity(store.publishedThemeId === themeId ? "Thème publié modifié" : "Brouillon de thème enregistré", `/admin/theme/${themeId}`);
  await pushThemeLater(themeId, "Thème modifié depuis l'admin");
  refresh(store.slug);
  return { ok: true };
}

export async function saveCustomCss(_: { ok?: boolean; error?: string } | undefined, form: FormData): Promise<{ ok?: boolean; error?: string }> {
  const { store } = await requirePerm("content");
  const themeId = String(form.get("themeId") ?? "");
  if (!(await ownTheme(store.id, themeId))) return { error: "Thème introuvable." };
  const raw = String(form.get("css") ?? "");
  if (raw.length > CUSTOM_CSS_MAX) return { error: `CSS trop long (${CUSTOM_CSS_MAX.toLocaleString("fr-FR")} caractères maximum).` };
  await saveThemeRow(store, themeId, { customCss: sanitizeCss(raw) });
  await logActivity("CSS personnalisé du thème modifié", `/admin/theme/${themeId}`);
  await pushThemeLater(themeId, "CSS personnalisé modifié depuis l'admin");
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
  const { store } = await requirePerm("content");
  const theme = await ownTheme(store.id, themeId);
  if (!theme) return { error: "Thème introuvable." };
  if (!(Object.values(THEME_FILES) as string[]).includes(file)) return { error: "Fichier inconnu." };
  if (content.length > 200_000) return { error: "Fichier trop long." };
  const { data, error } = storeUpdateFromFiles(theme, { [file]: content });
  if (error) return { error };
  await saveThemeRow(store, themeId, data);
  await logActivity(`Fichier ${file} du thème « ${theme.name} » modifié`, `/admin/theme/${themeId}/code`);
  await pushThemeLater(themeId, `${file} modifié depuis l'éditeur de code`);
  refresh(store.slug);
  return { ok: true };
}
