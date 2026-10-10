import { displayCurrency } from "@/lib/currency";
import { FilteredProducts, ListingHeader } from "@/components/store/Listing";
import { db } from "@/lib/db";
import { dict, translate } from "@/lib/i18n";
import { getCatalog, getStore } from "@/lib/storefront";
import { notFoundOrRedirect } from "@/lib/navigation";

const T = dict(
  { empty: "Cette collection est vide pour le moment." },
  { empty: "This collection is empty for now." },
);

export async function generateMetadata({ params }: { params: Promise<{ slug: string; handle: string }> }) {
  const { slug, handle } = await params;
  const { store, locale } = await getStore(slug);
  const raw = await db.collection.findUnique({ where: { storeId_handle: { storeId: store.id, handle } } });
  if (!raw) return {};
  const c = translate(raw, locale, ["title", "description"]);
  return { title: c.seoTitle || c.title, description: c.seoDescription || c.description.slice(0, 160) || undefined };
}

export default async function CollectionPage({ params, searchParams }: { params: Promise<{ slug: string; handle: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug, handle }, sp] = await Promise.all([params, searchParams]);
  const sort = typeof sp.sort === "string" ? sp.sort : undefined;
  const { store, locale } = await getStore(slug);
  const raw = await db.collection.findUnique({ where: { storeId_handle: { storeId: store.id, handle } } });
  if (!raw) return notFoundOrRedirect(store, `/c/${handle}`);
  const collection = translate(raw, locale, ["title", "description"]);
  const { products } = await getCatalog(store.id, locale);
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
        <ListingHeader title={collection.title} description={collection.description} count={list.length} sort={sort} keep={sp} locale={locale} />
        <FilteredProducts products={list} searchParams={sp} store={view} locale={locale} empty={<p className="text-[var(--c-muted)]">{T[locale].empty}</p>} />
      </div>
    </>
  );
}
