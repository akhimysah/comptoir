import { FavoritesList } from "@/components/store/FavoritesList";
import { displayCurrency } from "@/lib/currency";
import { getCustomer } from "@/lib/customer-auth";
import { dict } from "@/lib/i18n";
import { getStore } from "@/lib/storefront";

const T = dict({ title: "Mes favoris" }, { title: "My favourites" });

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { locale } = await getStore((await params).slug);
  return { title: T[locale].title, robots: { index: false } };
}

export default async function FavoritesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { store, locale } = await getStore(slug);
  const cur = await displayCurrency(store);
  const customer = await getCustomer(store.id);
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="mb-8 font-[family-name:var(--t-display)] text-3xl font-semibold md:text-4xl">{T[locale].title}</h1>
      <FavoritesList store={{ slug: store.slug, name: store.name, currency: cur.code, rate: cur.rate }} loggedIn={Boolean(customer)} />
    </div>
  );
}
