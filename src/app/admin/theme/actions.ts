"use server";

import { logActivity } from "@/lib/activity";

import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseThemeJson } from "@/lib/theme-files";
import { pushThemeLater } from "@/lib/github";
import { CUSTOM_CSS_MAX, sanitizeCss } from "@/lib/custom-css";

export async function saveTheme(json: string): Promise<{ error?: string; ok?: boolean }> {
  const { store } = await requirePerm("content");
  const parsed = parseThemeJson(json);
  if ("error" in parsed) return { error: parsed.error };
  await db.store.update({ where: { id: store.id }, data: { theme: JSON.stringify(parsed.theme), themeUpdatedAt: new Date() } });
  await logActivity("Thème publié", "/admin/theme");
  await pushThemeLater(store.id, "Thème publié depuis l'admin");
  revalidatePath(`/s/${store.slug}`, "layout");
  revalidatePath("/admin");
  return { ok: true };
}

export async function saveCustomCss(_: { ok?: boolean; error?: string } | undefined, form: FormData): Promise<{ ok?: boolean; error?: string }> {
  const { store } = await requirePerm("content");
  const raw = String(form.get("css") ?? "");
  if (raw.length > CUSTOM_CSS_MAX) return { error: `CSS trop long (${CUSTOM_CSS_MAX.toLocaleString("fr-FR")} caractères maximum).` };
  await db.store.update({ where: { id: store.id }, data: { customCss: sanitizeCss(raw) } });
  await logActivity("CSS personnalisé du thème modifié", "/admin/theme");
  await pushThemeLater(store.id, "CSS personnalisé modifié depuis l'admin");
  revalidatePath(`/s/${store.slug}`, "layout");
  revalidatePath("/admin/theme");
  return { ok: true };
}
