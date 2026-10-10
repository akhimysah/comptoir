import "server-only";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { db } from "./db";
import { parseJson } from "./utils";
import { readTranslations, type Locale } from "./i18n";

export const LINK_TYPES = ["home", "all", "collection", "product", "page", "blog", "post", "search", "url"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

const linkSchema = z.object({
  id: z.string().max(20),
  title: z.string().trim().min(1, "Chaque lien doit avoir un nom.").max(60),
  type: z.enum(LINK_TYPES),
  ref: z.string().max(40).optional().default(""), // id de la collection, du produit, de la page ou de l'article
  url: z.string().trim().max(500).optional().default(""),
});
export const menuItemSchema = linkSchema.extend({ children: z.array(linkSchema).max(30).optional().default([]) });
export const menuSchema = z.array(menuItemSchema).max(30);
export type MenuItem = z.infer<typeof menuItemSchema>;
export type MenuKey = "main" | "footer";
export type ResolvedLink = { title: string; href: string; external: boolean; children: ResolvedLink[] };

/** Une adresse personnalisée : un chemin de la boutique (/pages/x) ou une adresse web https://… Jamais javascript: ou autre. */
export function safeUrl(url: string) {
  const u = url.trim();
  if (/^https?:\/\/[^\s]+$/i.test(u)) return u;
  if (/^\/(?![/\\])[^\s]*$/.test(u)) return u;
  return null;
}

export const newLinkId = () => Math.random().toString(36).slice(2, 10);

/** Menus enregistrés, ou à défaut ceux qu'affichait la boutique : tous les produits, 4 collections, le blog ; pages du pied de page. */
export async function storeMenus(store: { id: string; menus: string }): Promise<Record<MenuKey, MenuItem[]>> {
  const saved = parseJson<Partial<Record<MenuKey, unknown>>>(store.menus, {});
  const main = menuSchema.safeParse(saved.main);
  const footer = menuSchema.safeParse(saved.footer);
  if (main.success && footer.success) return { main: main.data, footer: footer.data };
  const [collections, pages, posts] = await Promise.all([
    db.collection.findMany({ where: { storeId: store.id }, orderBy: { title: "asc" }, take: 4, select: { id: true, title: true } }),
    db.page.findMany({ where: { storeId: store.id, published: true, showInFooter: true }, orderBy: { createdAt: "asc" }, select: { id: true, title: true } }),
    db.blogPost.count({ where: { storeId: store.id, published: true } }),
  ]);
  const item = (title: string, type: LinkType, ref = ""): MenuItem => ({ id: newLinkId(), title, type, ref, url: "", children: [] });
  return {
    main: main.success ? main.data : [item("Tous les produits", "all"), ...collections.map((c) => item(c.title, "collection", c.id)), ...(posts ? [item("Blog", "blog")] : [])],
    footer: footer.success ? footer.data : [...pages.map((p) => item(p.title, "page", p.id)), ...(posts ? [item("Blog", "blog")] : [])],
  };
}

/** Transforme les menus en liens. Un lien vers un élément supprimé ou masqué disparaît. */
export const resolveMenus = cache(async (store: { id: string; slug: string; menus: string; translations?: string }, locale: Locale = "fr") => {
  const menus = await storeMenus(store);
  // Libellés traduits par le marchand (clé « menu.<libellé d'origine> »).
  const tr = locale === "fr" ? {} : readTranslations(store.translations)[locale] ?? {};
  const label = (title: string) => tr[`menu.${title}`]?.trim() || title;
  const all = [...menus.main, ...menus.footer].flatMap((i) => [i, ...i.children]);
  const ids = (t: LinkType) => all.filter((i) => i.type === t && i.ref).map((i) => i.ref);
  const [collections, products, pages, posts] = await Promise.all([
    db.collection.findMany({ where: { storeId: store.id, id: { in: ids("collection") } }, select: { id: true, handle: true } }),
    db.product.findMany({ where: { storeId: store.id, id: { in: ids("product") }, status: "active" }, select: { id: true, handle: true } }),
    db.page.findMany({ where: { storeId: store.id, id: { in: ids("page") }, published: true }, select: { id: true, handle: true } }),
    db.blogPost.findMany({ where: { storeId: store.id, id: { in: ids("post") }, published: true }, select: { id: true, handle: true } }),
  ]);
  const handle = (list: { id: string; handle: string }[], id: string) => list.find((x) => x.id === id)?.handle;
  const base = `/s/${store.slug}`;
  const href = (i: MenuItem | z.infer<typeof linkSchema>): string | null => {
    switch (i.type) {
      case "home": return base;
      case "all": return `${base}/products`;
      case "search": return `${base}/search`;
      case "blog": return `${base}/blog`;
      case "collection": { const h = handle(collections, i.ref); return h ? `${base}/c/${h}` : null; }
      case "product": { const h = handle(products, i.ref); return h ? `${base}/p/${h}` : null; }
      case "page": { const h = handle(pages, i.ref); return h ? `${base}/pages/${h}` : null; }
      case "post": { const h = handle(posts, i.ref); return h ? `${base}/blog/${h}` : null; }
      case "url": { const u = safeUrl(i.url); return u ? (u.startsWith("/") ? `${base}${u === "/" ? "" : u}` : u) : null; }
    }
  };
  const resolve = (items: MenuItem[]): ResolvedLink[] =>
    items.flatMap((i) => {
      const h = href(i);
      const children = (i.children ?? []).flatMap((c) => { const ch = href(c); return ch ? [{ title: label(c.title), href: ch, external: !ch.startsWith("/"), children: [] }] : []; });
      return h ? [{ title: label(i.title), href: h, external: !h.startsWith("/"), children }] : [];
    });
  return { main: resolve(menus.main), footer: resolve(menus.footer) };
});

/** Chemin normalisé d'une boutique : commence par /, sans / final, sans paramètres. */
export function normalizePath(p: string) {
  let s = p.trim().split(/[?#]/)[0];
  try { s = decodeURI(s); } catch {}
  if (!s.startsWith("/")) s = `/${s}`;
  s = s.replace(/\/{2,}/g, "/");
  if (s.length > 1) s = s.replace(/\/$/, "");
  return s.slice(0, 300);
}

/** Redirection automatique quand l'adresse d'un élément change (et suppression des boucles). */
export async function addAutoRedirect(storeId: string, from: string, to: string) {
  if (from === to) return;
  await db.redirect.deleteMany({ where: { storeId, fromPath: to } }); // le nouveau chemin existe vraiment : plus de redirection depuis lui
  await db.redirect.updateMany({ where: { storeId, toPath: from }, data: { toPath: to } }); // les anciennes redirections suivent
  await db.redirect.upsert({ where: { storeId_fromPath: { storeId, fromPath: from } }, update: { toPath: to }, create: { storeId, fromPath: from, toPath: to } });
}

/** À appeler à la place de notFound() sur la boutique : suit une redirection si elle existe. */
export async function notFoundOrRedirect(store: { id: string; slug: string }, path: string): Promise<never> {
  const from = normalizePath(path);
  const r = await db.redirect.findUnique({ where: { storeId_fromPath: { storeId: store.id, fromPath: from } } });
  if (r) {
    await db.redirect.update({ where: { id: r.id }, data: { hits: { increment: 1 } } });
    const to = safeUrl(r.toPath);
    if (to) permanentRedirect(to.startsWith("/") ? `/s/${store.slug}${to === "/" ? "" : to}` : to);
  }
  notFound();
}
