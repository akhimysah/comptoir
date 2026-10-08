import { ProductGrid } from "@/components/store/ProductCard";
import { getCatalog, getStore } from "@/lib/storefront";
import { db } from "@/lib/db";

export const metadata = { title: "Recherche" };

/** Sans accents ni majuscules : « ceramique » trouve « Céramique ». */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default async function SearchPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string }> }) {
  const [{ slug }, { q = "" }] = await Promise.all([params, searchParams]);
  const { store } = await getStore(slug);
  const { products } = await getCatalog(store.id);
  const terms = norm(q).split(/\s+/).filter(Boolean);
  let results = products;
  if (terms.length) {
    const texts = new Map((await db.product.findMany({ where: { storeId: store.id, status: "active" }, select: { id: true, title: true, description: true } })).map((p) => [p.id, norm(`${p.title} ${p.description}`)]));
    const titleHit = (id: string, title: string) => terms.every((t) => norm(title).includes(t));
    results = products
      .filter((p) => terms.every((t) => (texts.get(p.id) ?? norm(p.title)).includes(t)))
      .sort((a, b) => Number(titleHit(b.id, b.title)) - Number(titleHit(a.id, a.title)));
  } else results = [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <form className="mb-8 flex max-w-xl gap-2" role="search">
        <input name="q" defaultValue={q} autoFocus placeholder="Rechercher un produit" aria-label="Rechercher un produit" className="w-full rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] bg-[var(--c-surface)] px-4 py-3 outline-none focus:border-[var(--c-text)]" />
        <button className="rounded-[var(--t-radius)] bg-[var(--c-accent)] px-5 font-semibold text-[var(--c-accent-text)]">Rechercher</button>
      </form>
      {terms.length > 0 && <h1 className="mb-6 font-[family-name:var(--t-display)] text-2xl font-semibold">{results.length} résultat{results.length > 1 ? "s" : ""} pour « {q} »</h1>}
      {results.length ? <ProductGrid products={results} store={store} /> : terms.length ? <p className="text-[var(--c-muted)]">Aucun produit ne correspond. Essayez un autre mot, ou <a href={`/s/${slug}/products`} className="underline underline-offset-4">voyez tous les produits</a>.</p> : null}
    </div>
  );
}
