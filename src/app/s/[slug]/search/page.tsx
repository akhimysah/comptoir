import { displayCurrency } from "@/lib/currency";
import { FilteredProducts } from "@/components/store/Listing";
import { getCatalog, getStore } from "@/lib/storefront";
import { searchProducts, searchTerms } from "@/lib/search";

export const metadata = { title: "Recherche" };


export default async function SearchPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const q = typeof sp.q === "string" ? sp.q : "";
  const { store } = await getStore(slug);
  const { collections } = await getCatalog(store.id);
  const cur = await displayCurrency(store);
  const view = { ...store, currency: cur.code, rate: cur.rate };
  const terms = searchTerms(q);
  const results = await searchProducts(store.id, q);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <form className="mb-8 flex max-w-xl gap-2" role="search">
        <input name="q" defaultValue={q} autoFocus placeholder="Rechercher un produit" aria-label="Rechercher un produit" className="w-full rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] bg-[var(--c-surface)] px-4 py-3 outline-none focus:border-[var(--c-text)]" />
        <button className="rounded-[var(--t-radius)] bg-[var(--c-accent)] px-5 font-semibold text-[var(--c-accent-text)]">Rechercher</button>
      </form>
      {terms.length > 0 && <h1 className="mb-6 font-[family-name:var(--t-display)] text-2xl font-semibold">{results.length} résultat{results.length > 1 ? "s" : ""} pour « {q} »</h1>}
      {results.length ? <FilteredProducts products={results} collections={collections} searchParams={sp} store={view} empty={null} /> : terms.length ? <p className="text-[var(--c-muted)]">Aucun produit ne correspond. Essayez un autre mot, ou <a href={`/s/${slug}/products`} className="underline underline-offset-4">voyez tous les produits</a>.</p> : null}
    </div>
  );
}
