import { displayCurrency } from "@/lib/currency";
import { FilteredProducts, ListingHeader } from "@/components/store/Listing";
import { getCatalog, getStore } from "@/lib/storefront";

export const metadata = { title: "Tous les produits" };

export default async function AllProducts({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const sort = typeof sp.sort === "string" ? sp.sort : undefined;
  const { store } = await getStore(slug);
  const { products, collections } = await getCatalog(store.id);
  const cur = await displayCurrency(store);
  const view = { ...store, currency: cur.code, rate: cur.rate };
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <ListingHeader title="Tous les produits" count={products.length} sort={sort} keep={sp} />
      <FilteredProducts products={products} collections={collections} searchParams={sp} store={view} empty={<p className="text-[var(--c-muted)]">La boutique n'a pas encore de produit en ligne.</p>} />
    </div>
  );
}
