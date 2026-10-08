import { ProductGrid } from "@/components/store/ProductCard";
import { ListingHeader, sortProducts } from "@/components/store/Listing";
import { getCatalog, getStore } from "@/lib/storefront";

export const metadata = { title: "Tous les produits" };

export default async function AllProducts({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ sort?: string }> }) {
  const [{ slug }, { sort }] = await Promise.all([params, searchParams]);
  const { store } = await getStore(slug);
  const { products } = await getCatalog(store.id);
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <ListingHeader title="Tous les produits" count={products.length} sort={sort} />
      {products.length ? <ProductGrid products={sortProducts(products, sort)} store={store} /> : <p className="text-[var(--c-muted)]">La boutique n'a pas encore de produit en ligne.</p>}
    </div>
  );
}
