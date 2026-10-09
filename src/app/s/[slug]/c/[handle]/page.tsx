import { displayCurrency } from "@/lib/currency";
import { ListingHeader, sortProducts } from "@/components/store/Listing";
import { ProductGrid } from "@/components/store/ProductCard";
import { db } from "@/lib/db";
import { getCatalog, getStore } from "@/lib/storefront";
import { notFoundOrRedirect } from "@/lib/navigation";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; handle: string }> }) {
  const { slug, handle } = await params;
  const { store } = await getStore(slug);
  const c = await db.collection.findUnique({ where: { storeId_handle: { storeId: store.id, handle } } });
  if (!c) return {};
  return { title: c.seoTitle || c.title, description: c.seoDescription || c.description.slice(0, 160) || undefined };
}

export default async function CollectionPage({ params, searchParams }: { params: Promise<{ slug: string; handle: string }>; searchParams: Promise<{ sort?: string }> }) {
  const [{ slug, handle }, { sort }] = await Promise.all([params, searchParams]);
  const { store } = await getStore(slug);
  const collection = await db.collection.findUnique({ where: { storeId_handle: { storeId: store.id, handle } } });
  if (!collection) return notFoundOrRedirect(store, `/c/${handle}`);
  const { products } = await getCatalog(store.id);
  const list = products.filter((p) => p.collectionHandles.includes(handle));
  const cur = await displayCurrency(store);
  const view = { ...store, currency: cur.code, rate: cur.rate };
  return (
    <>
      {collection.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={collection.image} alt="" className="h-56 w-full object-cover md:h-72" />
      )}
      <div className="mx-auto max-w-6xl px-4 py-12">
        <ListingHeader title={collection.title} description={collection.description} count={list.length} sort={sort} />
        {list.length ? <ProductGrid products={sortProducts(list, sort)} store={view} /> : <p className="text-[var(--c-muted)]">Cette collection est vide pour le moment.</p>}
      </div>
    </>
  );
}
