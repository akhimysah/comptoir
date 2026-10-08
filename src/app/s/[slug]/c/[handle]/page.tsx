import { notFound } from "next/navigation";
import { ListingHeader, sortProducts } from "@/components/store/Listing";
import { ProductGrid } from "@/components/store/ProductCard";
import { db } from "@/lib/db";
import { getCatalog, getStore } from "@/lib/storefront";

export default async function CollectionPage({ params, searchParams }: { params: Promise<{ slug: string; handle: string }>; searchParams: Promise<{ sort?: string }> }) {
  const [{ slug, handle }, { sort }] = await Promise.all([params, searchParams]);
  const { store } = await getStore(slug);
  const collection = await db.collection.findUnique({ where: { storeId_handle: { storeId: store.id, handle } } });
  if (!collection) notFound();
  const { products } = await getCatalog(store.id);
  const list = products.filter((p) => p.collectionHandles.includes(handle));
  return (
    <>
      {collection.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={collection.image} alt="" className="h-56 w-full object-cover md:h-72" />
      )}
      <div className="mx-auto max-w-6xl px-4 py-12">
        <ListingHeader title={collection.title} description={collection.description} count={list.length} sort={sort} />
        {list.length ? <ProductGrid products={sortProducts(list, sort)} store={store} /> : <p className="text-[var(--c-muted)]">Cette collection est vide pour le moment.</p>}
      </div>
    </>
  );
}
