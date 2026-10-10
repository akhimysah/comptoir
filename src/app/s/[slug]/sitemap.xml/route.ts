import { db } from "@/lib/db";
import { appUrl } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** Plan du site d'une boutique, pour Google : /s/<boutique>/sitemap.xml */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await db.store.findUnique({ where: { slug } });
  if (!store || store.passwordEnabled) return new Response("Introuvable", { status: 404 });
  const [products, collections, pages, posts] = await Promise.all([
    db.product.findMany({ where: { storeId: store.id, status: "active" }, select: { handle: true, updatedAt: true } }),
    db.collection.findMany({ where: { storeId: store.id }, select: { handle: true, createdAt: true } }),
    db.page.findMany({ where: { storeId: store.id, published: true }, select: { handle: true, updatedAt: true } }),
    db.blogPost.findMany({ where: { storeId: store.id, published: true }, select: { handle: true, updatedAt: true } }),
  ]);
  const base = `${appUrl()}/s/${slug}`;
  const url = (path: string, d?: Date) => `<url><loc>${base}${path}</loc>${d ? `<lastmod>${d.toISOString().slice(0, 10)}</lastmod>` : ""}</url>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[url(""), url("/products"), ...products.map((p) => url(`/p/${p.handle}`, p.updatedAt)), ...collections.map((c) => url(`/c/${c.handle}`, c.createdAt)), ...pages.map((p) => url(`/pages/${p.handle}`, p.updatedAt)), ...(posts.length ? [url("/blog")] : []), ...posts.map((p) => url(`/blog/${p.handle}`, p.updatedAt))].join("\n")}
</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
