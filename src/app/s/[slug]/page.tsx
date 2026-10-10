import { displayCurrency } from "@/lib/currency";
import { Sections } from "@/components/store/Sections";
import { getCatalog, getStore } from "@/lib/storefront";

export default async function StoreHome({ params }: { params: Promise<{ slug: string }> }) {
  const { store, theme, locale } = await getStore((await params).slug);
  const { products, collections } = await getCatalog(store.id, locale);
  const cur = await displayCurrency(store);
  return <Sections sections={theme.sections} products={products} collections={collections} store={{ ...store, currency: cur.code, rate: cur.rate }} locale={locale} />;
}
