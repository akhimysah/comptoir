"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { requireOwner, requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { readTranslations, type Translations } from "@/lib/i18n";
import { pushThemeLater } from "@/lib/github";

/** Langues de la boutique : le français reste la langue principale, l'anglais s'ajoute. */
export async function saveLanguages(form: FormData) {
  const { store } = await requireOwner();
  const languages = form.get("en") === "on" ? ["fr", "en"] : ["fr"];
  await db.store.update({ where: { id: store.id }, data: { languages: JSON.stringify(languages) } });
  await logActivity(languages.includes("en") ? "Boutique en anglais activée" : "Boutique en anglais désactivée", "/admin/settings/languages");
  revalidatePath("/admin/settings/languages");
}

/** Lit les champs « en.<clé> » du formulaire (vides = pas de traduction, le français est affiché). */
function readFields(form: FormData, max = 20_000) {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("en.") || typeof v !== "string") continue;
    const text = v.trim().slice(0, max);
    if (text) out[k.slice(3)] = text;
  }
  return out;
}
const merge = (json: string, en: Record<string, string>) => {
  const t: Translations = readTranslations(json);
  t.en = en;
  return JSON.stringify(t);
};

/** Textes de la boutique : slogan, message du mot de passe, bandeau d'annonce, sections du thème, menus. */
export async function saveStoreTranslations(form: FormData) {
  const { store } = await requirePerm("content");
  await db.store.update({ where: { id: store.id }, data: { translations: merge(store.translations, readFields(form, 2000)) } });
  await pushThemeLater(store.id, "Traductions de la boutique modifiées depuis l'admin");
  revalidatePath("/admin/settings/languages");
  redirect("/admin/settings/languages?tab=store&saved=1");
}

const FIELDS = { product: ["title", "description", "seoTitle", "seoDescription"], collection: ["title", "description"], page: ["title", "body"] } as const;

/** Traduction d'un produit, d'une collection ou d'une page. */
export async function saveEntityTranslations(form: FormData) {
  const kind = String(form.get("kind"));
  const { store } = await requirePerm(kind === "product" ? "products" : "content");
  const id = String(form.get("id"));
  if (!(kind in FIELDS)) return;
  const allowed = FIELDS[kind as keyof typeof FIELDS] as readonly string[];
  const en = Object.fromEntries(Object.entries(readFields(form)).filter(([k]) => allowed.includes(k)));
  const where = { id, storeId: store.id };
  if (kind === "product") { const p = await db.product.findFirst({ where }); if (p) await db.product.update({ where: { id }, data: { translations: merge(p.translations, en) } }); }
  if (kind === "collection") { const c = await db.collection.findFirst({ where }); if (c) await db.collection.update({ where: { id }, data: { translations: merge(c.translations, en) } }); }
  if (kind === "page") { const p = await db.page.findFirst({ where }); if (p) await db.page.update({ where: { id }, data: { translations: merge(p.translations, en) } }); }
  const tab = kind === "product" ? "products" : kind === "collection" ? "collections" : "pages";
  redirect(`/admin/settings/languages?tab=${tab}&saved=${id}${form.get("q") ? `&q=${encodeURIComponent(String(form.get("q")))}` : ""}#${id}`);
}
