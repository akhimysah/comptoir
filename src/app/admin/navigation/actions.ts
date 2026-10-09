"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { menuSchema, normalizePath, safeUrl, storeMenus, type MenuItem, type MenuKey } from "@/lib/navigation";
import { parseJson } from "@/lib/utils";

export async function saveMenu(key: MenuKey, items: MenuItem[]): Promise<{ error?: string; ok?: boolean }> {
  const { store } = await requirePerm("content");
  if (key !== "main" && key !== "footer") return { error: "Menu inconnu." };
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

  const current = await storeMenus(store);
  const menus = { ...current, ...parseJson<object>(store.menus, {}), [key]: parsed.data };
  await db.store.update({ where: { id: store.id }, data: { menus: JSON.stringify(menus) } });
  await logActivity(`${key === "main" ? "Menu principal" : "Menu du pied de page"} modifié`, "/admin/navigation");
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
