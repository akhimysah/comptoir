import { FavoritesList } from "@/components/store/FavoritesList";
import { displayCurrency } from "@/lib/currency";
import { getCustomer } from "@/lib/customer-auth";
import { getStore } from "@/lib/storefront";

export const metadata = { title: "Mes favoris", robots: { index: false } };

export default async function FavoritesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { store } = await getStore(slug);
  const cur = await displayCurrency(store);
  const customer = await getCustomer(store.id);
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="mb-8 font-[family-name:var(--t-display)] text-3xl font-semibold md:text-4xl">Mes favoris</h1>
      <FavoritesList store={{ slug: store.slug, name: store.name, currency: cur.code, rate: cur.rate }} loggedIn={Boolean(customer)} />
    </div>
  );
}
