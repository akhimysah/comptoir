"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { menuSchema, normalizePath, RESERVED_MENU_HANDLES, safeUrl, storeMenus, type MenuItem, type MenuKey } from "@/lib/navigation";
import { slugify } from "@/lib/utils";
import { parseJson } from "@/lib/utils";

export async function saveMenu(key: MenuKey, items: MenuItem[]): Promise<{ error?: string; ok?: boolean }> {
  const { store } = await requirePerm("content");
  const current = await storeMenus(store);
  const extraIndex = current.extra.findIndex((e) => e.handle === key);
  if (key !== "main" && key !== "footer" && extraIndex < 0) return { error: "Menu inconnu." };
  const parsed = menuSchema.safeParse(items);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const flat = parsed.data.flatMap((i) => [i, ...i.children]);
  for (const i of flat) {
    if (i.type === "url" && !safeUrl(i.url)) return { error: `« ${i.title} » : indiquez un chemin de la boutique (/pages/contact) ou une adresse complète (https://…).` };
    if (["collection", "product", "page", "post"].includes(i.type) && !i.ref) return { error: `« ${i.title} » : choisissez vers quoi pointe ce lien.` };
  }
  // Les éléments liés doivent appartenir à cette boutique.
  const refs = (t: string) => flat.filter((i) => i.type === t).map((i) => i.ref);
  const [c, p, pg, po] = await Promise.all([
    db.collection.count({ where: { storeId: store.id, id: { in: refs("collection") } } }),
    db.product.count({ where: { storeId: store.id, id: { in: refs("product") } } }),
    db.page.count({ where: { storeId: store.id, id: { in: refs("page") } } }),
    db.blogPost.count({ where: { storeId: store.id, id: { in: refs("post") } } }),
  ]);
  const uniq = (t: string) => new Set(refs(t)).size;
  if (c !== uniq("collection") || p !== uniq("product") || pg !== uniq("page") || po !== uniq("post")) return { error: "Un lien pointe vers un élément qui n'existe plus. Rechargez la page." };

  const menus = extraIndex >= 0
    ? { ...current, extra: current.extra.map((e) => (e.handle === key ? { ...e, items: parsed.data } : e)) }
    : { ...current, ...parseJson<object>(store.menus, {}), extra: current.extra, [key]: parsed.data };
  await db.store.update({ where: { id: store.id }, data: { menus: JSON.stringify(menus) } });
  await logActivity(`${key === "main" ? "Menu principal" : key === "footer" ? "Menu du pied de page" : `Menu « ${current.extra[extraIndex].title} »`} modifié`, "/admin/navigation");
  revalidatePath(`/s/${store.slug}`, "layout");
  revalidatePath("/admin/navigation");
  return { ok: true };
}

export async function addRedirect(_: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  const { store } = await requirePerm("content");
  const from = normalizePath(String(form.get("from") ?? ""));
  const rawTo = String(form.get("to") ?? "").trim();
  const to = /^https?:\/\//i.test(rawTo) ? rawTo : normalizePath(rawTo);
  if (from === "/" || from.length < 2) return { error: "Indiquez l'ancienne adresse, par exemple /ancienne-page." };
  if (!rawTo || !safeUrl(to)) return { error: "Indiquez la nouvelle adresse : un chemin (/c/bols) ou une adresse complète (https://…)." };
  if (from === to) return { error: "Les deux adresses sont identiques." };
  if (await db.redirect.findFirst({ where: { storeId: store.id, fromPath: to, toPath: from } })) return { error: "Cette redirection créerait une boucle avec une redirection existante." };
  await db.redirect.upsert({ where: { storeId_fromPath: { storeId: store.id, fromPath: from } }, update: { toPath: to }, create: { storeId: store.id, fromPath: from, toPath: to } });
  await logActivity(`Redirection ${from} → ${to}`, "/admin/navigation");
  revalidatePath("/admin/navigation");
  return { ok: true };
}

export async function deleteRedirect(form: FormData) {
  const { store } = await requirePerm("content");
  await db.redirect.deleteMany({ where: { id: String(form.get("id")), storeId: store.id } });
  revalidatePath("/admin/navigation");
}

/** « Ajouter un menu » : un menu supplémentaire avec son identifiant (ex. « liens-rapides »), que les thèmes peuvent choisir. */
export async function addMenu(form: FormData) {
  const { store } = await requirePerm("content");
  const title = String(form.get("title") ?? "").trim().slice(0, 60);
  const handle = slugify(title).slice(0, 40);
  const current = await storeMenus(store);
  if (!title || handle.length < 2) return;
  if (RESERVED_MENU_HANDLES.includes(handle) || current.extra.some((e) => e.handle === handle)) return;
  if (current.extra.length >= 20) return;
  await db.store.update({ where: { id: store.id }, data: { menus: JSON.stringify({ ...current, extra: [...current.extra, { handle, title, items: [] }] }) } });
  await logActivity(`Menu « ${title} » créé`, "/admin/navigation");
  revalidatePath("/admin/navigation");
}

export async function deleteMenu(form: FormData) {
  const { store } = await requirePerm("content");
  const handle = String(form.get("handle") ?? "");
  const current = await storeMenus(store);
  const menu = current.extra.find((e) => e.handle === handle);
  if (!menu) return;
  await db.store.update({ where: { id: store.id }, data: { menus: JSON.stringify({ ...current, extra: current.extra.filter((e) => e.handle !== handle) }) } });
  await logActivity(`Menu « ${menu.title} » supprimé`, "/admin/navigation");
  revalidatePath(`/s/${store.slug}`, "layout");
  revalidatePath("/admin/navigation");
}
