import { displayCurrency } from "@/lib/currency";
import { FilteredProducts } from "@/components/store/Listing";
import { dict } from "@/lib/i18n";
import { getCatalog, getStore } from "@/lib/storefront";
import { searchProducts, searchTerms } from "@/lib/search";

const T = dict(
  {
    title: "Recherche",
    placeholder: "Rechercher un produit",
    submit: "Rechercher",
    results: (n: number, q: string) => `${n} résultat${n > 1 ? "s" : ""} pour « ${q} »`,
    none: "Aucun produit ne correspond. Essayez un autre mot, ou ",
    all: "voyez tous les produits",
  },
  {
    title: "Search",
    placeholder: "Search for a product",
    submit: "Search",
    results: (n: number, q: string) => `${n} result${n > 1 ? "s" : ""} for “${q}”`,
    none: "No products match. Try another word, or ",
    all: "browse all products",
  },
);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { locale } = await getStore((await params).slug);
  return { title: T[locale].title };
}

export default async function SearchPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const q = typeof sp.q === "string" ? sp.q : "";
  const { store, locale } = await getStore(slug);
  const t = T[locale];
  const { products, collections } = await getCatalog(store.id, locale);
  const cur = await displayCurrency(store);
  const view = { ...store, currency: cur.code, rate: cur.rate };
  const terms = searchTerms(q);
  // La recherche porte sur le texte d'origine ; les cartes affichent la version traduite.
  const translated = new Map(products.map((p) => [p.id, p]));
  const results = (await searchProducts(store.id, q, locale)).map((p) => translated.get(p.id) ?? p);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <form className="mb-8 flex max-w-xl gap-2" role="search">
        <input name="q" defaultValue={q} autoFocus placeholder={t.placeholder} aria-label={t.placeholder} className="w-full rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] bg-[var(--c-surface)] px-4 py-3 outline-none focus:border-[var(--c-text)]" />
        <button className="rounded-[var(--t-radius)] bg-[var(--c-accent)] px-5 font-semibold text-[var(--c-accent-text)]">{t.submit}</button>
      </form>
      {terms.length > 0 && <h1 className="mb-6 font-[family-name:var(--t-display)] text-2xl font-semibold">{t.results(results.length, q)}</h1>}
      {results.length ? <FilteredProducts products={results} collections={collections} searchParams={sp} store={view} empty={null} locale={locale} /> : terms.length ? <p className="text-[var(--c-muted)]">{t.none}<a href={`/s/${slug}/products`} className="underline underline-offset-4">{t.all}</a>.</p> : null}
    </div>
  );
}
