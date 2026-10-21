import { notFound } from "next/navigation";
import { ThemeEditor } from "@/components/admin/ThemeEditor";
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
  return <ThemeEditor themeId={theme.id} name={theme.name} published={published} initial={readTheme(theme.theme, store.name)} store={{ slug: store.slug, name: store.name, currency: store.currency }} products={products} collections={collections} posts={await latestPosts(store.id)} />;
}
