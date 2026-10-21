import { displayCurrency } from "@/lib/currency";
import { Sections } from "@/components/store/Sections";
import { getCatalog, getStore, latestPosts } from "@/lib/storefront";

export default async function StoreHome({ params }: { params: Promise<{ slug: string }> }) {
  const { store, theme, locale } = await getStore((await params).slug);
  const [{ products, collections }, posts] = await Promise.all([getCatalog(store.id, locale), theme.sections.some((s) => s.type === "blog") ? latestPosts(store.id) : Promise.resolve([])]);
  const cur = await displayCurrency(store);
  return <Sections sections={theme.sections} products={products} collections={collections} posts={posts} store={{ ...store, currency: cur.code, rate: cur.rate }} locale={locale} />;
}
