import type { Section } from "@/lib/theme";
import { Countdown } from "./Countdown";
import { NewsletterForm } from "./NewsletterForm";
import { ProductCard, ProductGrid } from "./ProductCard";
import { conv, storeHref, type CardCollection, type CardPost, type CardProduct, type StoreInfo } from "./types";
import { dict, intlLocale, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { embedUrl } from "@/lib/video";

const T = dict(
  { none: "Aucune section. Ajoutez-en depuis l'éditeur de thème.", all: "Tout voir", empty: "Aucun produit en ligne pour le moment.", view: "Voir le produit", noPosts: "Aucun article pour le moment.", readMore: "Lire la suite", days: "jours", hours: "heures", minutes: "min", seconds: "sec", ended: "L'offre est terminée.", noImages: "Ajoutez des images à cette galerie depuis l'éditeur de thème.", noVideo: "Ajoutez l'adresse d'une vidéo YouTube ou Vimeo depuis l'éditeur de thème." },
  { none: "No sections yet. Add some from the theme editor.", all: "View all", empty: "No products available yet.", view: "View product", noPosts: "No articles yet.", readMore: "Read more", days: "days", hours: "hours", minutes: "min", seconds: "sec", ended: "This offer has ended.", noImages: "Add images to this gallery from the theme editor.", noVideo: "Add a YouTube or Vimeo video link from the theme editor." },
);

const display = "font-[family-name:var(--t-display)]";
const btn = "inline-flex items-center justify-center rounded-[var(--t-radius)] bg-[var(--c-accent)] px-6 py-3 font-semibold text-[var(--c-accent-text)] transition hover:opacity-90";

export function Sections({ sections, products, collections, posts = [], store, selectedId, locale = "fr" }: {
  sections: Section[];
  products: CardProduct[];
  collections: CardCollection[];
  posts?: CardPost[];
  store: StoreInfo;
  /** Section mise en évidence dans l'éditeur de thème. */
  selectedId?: string | null;
  locale?: Locale;
}) {
  return (
    <>
      {sections.filter((s) => !s.hidden).map((s) => (
        <div key={s.id} data-section={s.id} className={selectedId === s.id ? "outline outline-2 -outline-offset-2 outline-[#3B82F6]" : undefined}>
          <SectionView s={s} products={products} collections={collections} posts={posts} store={store} locale={locale} />
        </div>
      ))}
      {!sections.some((s) => !s.hidden) && <p className="px-4 py-24 text-center text-[var(--c-muted)]">{T[locale].none}</p>}
    </>
  );
}

function SectionView({ s, products, collections, posts, store, locale }: { s: Section; products: CardProduct[]; collections: CardCollection[]; posts: CardPost[]; store: StoreInfo; locale: Locale }) {
  const t = T[locale];
  const h2 = `${display} text-2xl font-semibold md:text-3xl`;
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
    case "slideshow":
      return (
        <section className="relative">
          <div className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {s.slides.map((sl, i) => (
              <div key={i} id={`${s.id}-${i}`} className="relative w-full flex-none snap-start overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {sl.image ? <img src={sl.image} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 bg-[var(--c-surface)]" />}
                {sl.image && <div className="absolute inset-0 bg-black/35" />}
                <div className={`relative mx-auto flex max-w-6xl flex-col items-start gap-5 px-4 py-24 md:py-36 ${sl.image ? "text-white" : ""}`}>
                  <h2 className={`${display} max-w-[16ch] text-4xl font-semibold leading-[1.05] md:text-6xl`}>{sl.title}</h2>
                  {sl.subtitle && <p className={`max-w-[52ch] text-lg ${sl.image ? "text-white/85" : "text-[var(--c-muted)]"}`}>{sl.subtitle}</p>}
                  {sl.buttonLabel && <a href={storeHref(store.slug, sl.buttonLink)} className={btn}>{sl.buttonLabel}</a>}
                </div>
              </div>
            ))}
          </div>
          {s.slides.length > 1 && (
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
              {s.slides.map((_, i) => <a key={i} href={`#${s.id}-${i}`} aria-label={`${i + 1}`} className="h-2.5 w-2.5 rounded-full bg-white/70 ring-1 ring-black/20 hover:bg-white" />)}
            </div>
          )}
        </section>
      );
    case "multicolumn":
      return (
        <section className="mx-auto max-w-6xl px-4 py-14">
          {s.title && <h2 className={`${h2} mb-8 text-center`}>{s.title}</h2>}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {s.columns.map((c, i) => (
              <div key={i} className="rounded-[var(--t-radius)] bg-[var(--c-surface)] p-6">
                {c.icon && <div className="mb-3 text-3xl" aria-hidden>{c.icon}</div>}
                <h3 className={`${display} text-lg font-semibold`}>{c.title}</h3>
                <p className="mt-1 text-[var(--c-muted)]">{c.text}</p>
              </div>
            ))}
          </div>
        </section>
      );
    case "testimonials":
      return (
        <section className="bg-[var(--c-surface)] py-14">
          <div className="mx-auto max-w-6xl px-4">
            {s.title && <h2 className={`${h2} mb-8 text-center`}>{s.title}</h2>}
            <div className="grid gap-6 md:grid-cols-3">
              {s.items.map((it, i) => (
                <figure key={i} className="rounded-[var(--t-radius)] bg-[var(--c-background)] p-6">
                  {it.rating > 0 && <div className="mb-2 text-[var(--c-accent)]" aria-label={`${it.rating}/5`}>{"★".repeat(it.rating)}<span className="opacity-30">{"★".repeat(5 - it.rating)}</span></div>}
                  <blockquote className="text-lg leading-relaxed">« {it.quote} »</blockquote>
                  {it.author && <figcaption className="mt-3 text-sm font-semibold text-[var(--c-muted)]">— {it.author}</figcaption>}
                </figure>
              ))}
            </div>
          </div>
        </section>
      );
    case "newsletter":
      return (
        <section className="mx-auto max-w-2xl px-4 py-14 text-center">
          {s.title && <h2 className={`${h2} mb-2`}>{s.title}</h2>}
          {s.body && <p className="mb-6 text-[var(--c-muted)]">{s.body}</p>}
          <NewsletterForm slug={store.slug} />
        </section>
      );
    case "faq":
      return (
        <section className="mx-auto max-w-3xl px-4 py-14">
          {s.title && <h2 className={`${h2} mb-6`}>{s.title}</h2>}
          <div className="divide-y divide-[color-mix(in_srgb,var(--c-text)_12%,transparent)] border-y border-[color-mix(in_srgb,var(--c-text)_12%,transparent)]">
            {s.items.map((it, i) => (
              <details key={i} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">{it.question}<span className="text-xl transition group-open:rotate-45" aria-hidden>+</span></summary>
                <p className="mt-3 whitespace-pre-line text-[var(--c-muted)]">{it.answer}</p>
              </details>
            ))}
          </div>
        </section>
      );
    case "marquee": {
      if (!s.body) return null;
      const items = Array.from({ length: 6 }, () => s.body);
      return (
        <section className="overflow-hidden bg-[var(--c-accent)] py-3 text-[var(--c-accent-text)]" aria-label={s.body}>
          <div className="flex w-max animate-[marquee_30s_linear_infinite] gap-12 whitespace-nowrap font-semibold motion-reduce:animate-none" aria-hidden>
            {[...items, ...items].map((x, i) => <span key={i}>{x}</span>)}
          </div>
          <style>{`@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
        </section>
      );
    }
    case "featuredProduct": {
      const p = (s.productHandle ? products.find((x) => x.handle === s.productHandle) : products[0]) ?? null;
      if (!p) return null;
      const money = (c: number) => formatMoney(conv(c, store), store.currency, intlLocale(locale));
      return (
        <section className="mx-auto max-w-6xl px-4 py-14">
          {s.title && <h2 className={`${h2} mb-7`}>{s.title}</h2>}
          <div className="grid items-center gap-8 rounded-[var(--t-radius)] bg-[var(--c-surface)] p-6 md:grid-cols-2 md:p-10">
            <div className="[&>a]:block"><ProductCard p={p} store={store} locale={locale} /></div>
            <div className="flex flex-col items-start gap-4">
              <h3 className={`${display} text-3xl font-semibold leading-tight`}>{p.title}</h3>
              <p className="text-xl">{money(p.priceCents)}{p.compareAtCents && p.compareAtCents > p.priceCents ? <s className="ml-2 text-base text-[var(--c-muted)]">{money(p.compareAtCents)}</s> : null}</p>
              <a href={`/s/${store.slug}/p/${p.handle}`} className={btn}>{t.view}</a>
            </div>
          </div>
        </section>
      );
    }
    case "countdown":
      return (
        <section className="mx-auto max-w-3xl px-4 py-14 text-center">
          {s.title && <h2 className={`${h2} mb-6`}>{s.title}</h2>}
          <Countdown endsAt={s.endsAt} labels={[t.days, t.hours, t.minutes, t.seconds]} />
          {s.buttonLabel && <a href={storeHref(store.slug, s.buttonLink)} className={`${btn} mt-6`}>{s.buttonLabel}</a>}
        </section>
      );
    case "gallery":
      return (
        <section className="mx-auto max-w-6xl px-4 py-14">
          {s.title && <h2 className={`${h2} mb-7`}>{s.title}</h2>}
          {s.images.length ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {s.images.map((src, i) => <img key={i} src={src} alt="" className={`h-full w-full rounded-[var(--t-radius)] object-cover ${i % 5 === 0 ? "col-span-2 row-span-2 aspect-square" : "aspect-square"}`} />)}
            </div>
          ) : <p className="rounded-[var(--t-radius)] bg-[var(--c-surface)] px-4 py-16 text-center text-[var(--c-muted)]">{t.noImages}</p>}
        </section>
      );
    case "video": {
      const src = embedUrl(s.url);
      return (
        <section className="mx-auto max-w-4xl px-4 py-14">
          {s.title && <h2 className={`${h2} mb-6 text-center`}>{s.title}</h2>}
          {src ? <iframe src={src} title={s.title || "Vidéo"} className="aspect-video w-full rounded-[var(--t-radius)]" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen loading="lazy" /> : <p className="rounded-[var(--t-radius)] bg-[var(--c-surface)] px-4 py-16 text-center text-[var(--c-muted)]">{t.noVideo}</p>}
        </section>
      );
    }
    case "blog": {
      const list = posts.slice(0, s.limit);
      return (
        <section className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-7 flex items-end justify-between gap-4"><h2 className={h2}>{s.title}</h2><a href={`/s/${store.slug}/blog`} className="text-sm font-semibold underline underline-offset-4">{t.all}</a></div>
          {list.length ? (
            <div className="grid gap-6 md:grid-cols-3">
              {list.map((p) => (
                <a key={p.handle} href={`/s/${store.slug}/blog/${p.handle}`} className="group block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.image ? <img src={p.image} alt="" className="mb-3 aspect-[3/2] w-full rounded-[var(--t-radius)] object-cover" /> : <div className="mb-3 aspect-[3/2] rounded-[var(--t-radius)] bg-[var(--c-surface)]" />}
                  {p.publishedAt && <time className="text-xs text-[var(--c-muted)]">{new Date(p.publishedAt).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "long", year: "numeric" })}</time>}
                  <h3 className={`${display} text-lg font-semibold group-hover:underline`}>{p.title}</h3>
                  {p.excerpt && <p className="mt-1 line-clamp-2 text-[var(--c-muted)]">{p.excerpt}</p>}
                </a>
              ))}
            </div>
          ) : <p className="text-[var(--c-muted)]">{t.noPosts}</p>}
        </section>
      );
    }
  }
}
