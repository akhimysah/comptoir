import { Sections } from "@/components/store/Sections";
import { getCatalog, getStore } from "@/lib/storefront";

export default async function StoreHome({ params }: { params: Promise<{ slug: string }> }) {
  const { store, theme } = await getStore((await params).slug);
  const { products, collections } = await getCatalog(store.id);
  return <Sections sections={theme.sections} products={products} collections={collections} store={store} />;
}
