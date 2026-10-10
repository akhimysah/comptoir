import { displayCurrency } from "@/lib/currency";
import { FilteredProducts, ListingHeader } from "@/components/store/Listing";
import { dict } from "@/lib/i18n";
import { getCatalog, getStore } from "@/lib/storefront";

const T = dict(
  { title: "Tous les produits", empty: "La boutique n'a pas encore de produit en ligne." },
  { title: "All products", empty: "This store has no products available yet." },
);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { locale } = await getStore((await params).slug);
  return { title: T[locale].title };
}

export default async function AllProducts({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const sort = typeof sp.sort === "string" ? sp.sort : undefined;
  const { store, locale } = await getStore(slug);
  const t = T[locale];
  const { products, collections } = await getCatalog(store.id, locale);
  const cur = await displayCurrency(store);
  const view = { ...store, currency: cur.code, rate: cur.rate };
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <ListingHeader title={t.title} count={products.length} sort={sort} keep={sp} locale={locale} />
      <FilteredProducts products={products} collections={collections} searchParams={sp} store={view} locale={locale} empty={<p className="text-[var(--c-muted)]">{t.empty}</p>} />
    </div>
  );
}
