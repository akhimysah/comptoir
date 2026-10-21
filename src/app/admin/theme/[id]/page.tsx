import { notFound } from "next/navigation";
import { LiquidThemeEditor } from "@/components/admin/LiquidThemeEditor";
import { ThemeEditor } from "@/components/admin/ThemeEditor";
import { db } from "@/lib/db";
import { EDITABLE_TEMPLATES, liquidEditorData } from "@/lib/liquid/editor-data";
import { requirePerm } from "@/lib/auth";
import { latestPosts, getCatalog } from "@/lib/storefront";
import { readTheme } from "@/lib/theme";
import { ownTheme } from "@/lib/themes";

/** Éditeur plein écran d'un thème de la bibliothèque (publié ou brouillon). */
export const metadata = { title: "Éditeur de thème" };

export default async function ThemeEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { store } = await requirePerm("content");
  const theme = await ownTheme(store.id, id);
  if (!theme) notFound();
  const published = store.publishedThemeId === theme.id;
  const { products, collections } = await getCatalog(store.id);
  if (theme.engine === "liquid") {
    const [data, pages, posts] = await Promise.all([liquidEditorData(theme.id), db.page.findMany({ where: { storeId: store.id, published: true }, select: { handle: true, title: true } }), db.blogPost.findMany({ where: { storeId: store.id, published: true }, select: { handle: true, title: true }, take: 1 })]);
    const sample = { product: products[0]?.handle, collection: collections[0]?.handle, page: pages[0]?.handle, article: posts[0]?.handle };
    return (
      <LiquidThemeEditor
        themeId={theme.id} name={theme.name} published={published} slug={store.slug} data={data}
        templates={EDITABLE_TEMPLATES.map(({ key, label }) => ({ key, label })).filter((t) => data.templates[t.key])}
        previews={Object.fromEntries(EDITABLE_TEMPLATES.map((t) => [t.key, t.preview(sample)]))}
        pickers={{ products: products.map((p) => ({ handle: p.handle, title: p.title })), collections: collections.map((c) => ({ handle: c.handle, title: c.title })), pages, blogs: [{ handle: "news", title: "Actualités" }], menus: [{ handle: "main-menu", title: "Menu principal" }, { handle: "footer", title: "Menu de pied de page" }] }}
      />
    );
  }
  return <ThemeEditor themeId={theme.id} name={theme.name} published={published} initial={readTheme(theme.theme, store.name)} store={{ slug: store.slug, name: store.name, currency: store.currency }} products={products} collections={collections} posts={await latestPosts(store.id)} />;
}
