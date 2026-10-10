import type { Section } from "@/lib/theme";
import { ProductGrid } from "./ProductCard";
import { storeHref, type CardCollection, type CardProduct, type StoreInfo } from "./types";
import { dict, type Locale } from "@/lib/i18n";

const T = dict(
  { none: "Aucune section. Ajoutez-en depuis l'éditeur de thème.", all: "Tout voir", empty: "Aucun produit en ligne pour le moment." },
  { none: "No sections yet. Add some from the theme editor.", all: "View all", empty: "No products available yet." },
);

const display = "font-[family-name:var(--t-display)]";
const btn = "inline-flex items-center justify-center rounded-[var(--t-radius)] bg-[var(--c-accent)] px-6 py-3 font-semibold text-[var(--c-accent-text)] transition hover:opacity-90";

export function Sections({ sections, products, collections, store, selectedId, locale = "fr" }: {
  sections: Section[];
  products: CardProduct[];
  collections: CardCollection[];
  store: StoreInfo;
  /** Section mise en évidence dans l'éditeur de thème. */
  selectedId?: string | null;
  locale?: Locale;
}) {
  return (
    <>
      {sections.map((s) => (
        <div key={s.id} data-section={s.id} className={selectedId === s.id ? "outline outline-2 -outline-offset-2 outline-[#3B82F6]" : undefined}>
          <SectionView s={s} products={products} collections={collections} store={store} locale={locale} />
        </div>
      ))}
      {!sections.length && <p className="px-4 py-24 text-center text-[var(--c-muted)]">{T[locale].none}</p>}
    </>
  );
}

function SectionView({ s, products, collections, store, locale }: { s: Section; products: CardProduct[]; collections: CardCollection[]; store: StoreInfo; locale: Locale }) {
  const t = T[locale];
  switch (s.type) {
    case "hero":
      return (
        <section className="relative overflow-hidden">
          {s.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          {s.image && <div className="absolute inset-0 bg-black/35" />}
          <div className={`relative mx-auto flex max-w-6xl flex-col items-start gap-5 px-4 ${s.image ? "py-28 text-white md:py-40" : "py-20 md:py-28"}`}>
            <h1 className={`${display} max-w-[16ch] text-4xl font-semibold leading-[1.05] md:text-6xl`}>{s.title}</h1>
            {s.subtitle && <p className={`max-w-[52ch] text-lg ${s.image ? "text-white/85" : "text-[var(--c-muted)]"}`}>{s.subtitle}</p>}
            {s.buttonLabel && <a href={storeHref(store.slug, s.buttonLink)} className={btn}>{s.buttonLabel}</a>}
          </div>
        </section>
      );
    case "featured": {
      const list = (s.collectionHandle ? products.filter((p) => p.collectionHandles.includes(s.collectionHandle!)) : products).slice(0, s.limit);
      return (
        <section className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-7 flex items-end justify-between gap-4">
            <h2 className={`${display} text-2xl font-semibold md:text-3xl`}>{s.title}</h2>
            <a href={storeHref(store.slug, s.collectionHandle ? `/c/${s.collectionHandle}` : "/products")} className="text-sm font-semibold underline underline-offset-4">{t.all}</a>
          </div>
          {list.length ? <ProductGrid products={list} store={store} locale={locale} /> : <p className="text-[var(--c-muted)]">{t.empty}</p>}
        </section>
      );
    }
    case "text":
      return (
        <section className="mx-auto max-w-3xl px-4 py-14 text-center">
          {s.title && <h2 className={`${display} mb-4 text-2xl font-semibold md:text-3xl`}>{s.title}</h2>}
          <p className="whitespace-pre-line text-lg leading-relaxed text-[var(--c-muted)]">{s.body}</p>
        </section>
      );
    case "banner":
      return (
        <section className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid overflow-hidden rounded-[var(--t-radius)] bg-[var(--c-surface)] md:grid-cols-2">
            {s.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.image} alt="" className="aspect-[4/3] h-full w-full object-cover" />
            ) : (
              <div className="aspect-[4/3] bg-[var(--c-accent)] opacity-80" />
            )}
            <div className="flex flex-col items-start justify-center gap-5 p-8 md:p-12">
              <h2 className={`${display} text-3xl font-semibold leading-tight`}>{s.title}</h2>
              {s.buttonLabel && <a href={storeHref(store.slug, s.buttonLink)} className={btn}>{s.buttonLabel}</a>}
            </div>
          </div>
        </section>
      );
    case "collections":
      if (!collections.length) return null;
      return (
        <section className="mx-auto max-w-6xl px-4 py-14">
          <h2 className={`${display} mb-7 text-2xl font-semibold md:text-3xl`}>{s.title}</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {collections.map((c, i) => (
              <a key={c.handle} href={`/s/${store.slug}/c/${c.handle}`} className="group relative block aspect-[4/3] overflow-hidden rounded-[var(--t-radius)]">
                {c.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
                ) : (
                  <div className="h-full w-full" style={{ background: `linear-gradient(140deg, hsl(${(i * 67 + 140) % 360} 35% 72%), hsl(${(i * 67 + 170) % 360} 40% 52%))` }} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
                <span className={`${display} absolute bottom-4 left-4 text-xl font-semibold text-white`}>{c.title}<span className="ml-2 text-sm font-normal opacity-80">{c.count}</span></span>
              </a>
            ))}
          </div>
        </section>
      );
  }
}
