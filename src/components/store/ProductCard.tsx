import { Thumb } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { Stars } from "./Stars";
import { FavoriteButton } from "./FavoriteButton";
import { conv, type CardProduct, type StoreInfo } from "./types";
import { dict, intlLocale, type Locale } from "@/lib/i18n";

const T = dict(
  { soldOut: "Épuisé", from: (p: string) => `Dès ${p}` },
  { soldOut: "Sold out", from: (p: string) => `From ${p}` },
);

export function ProductCard({ p, store, locale = "fr" }: { p: CardProduct; store: StoreInfo; locale?: Locale }) {
  const t = T[locale];
  const money = (c: number) => formatMoney(conv(c, store), store.currency, intlLocale(locale));
  return (
    <a href={`/s/${store.slug}/p/${p.handle}`} className="group flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-[var(--t-radius)]">
        <Thumb image={p.image} hue={p.hue} title={p.title} rounded="" className="aspect-[4/5] w-full text-4xl transition duration-500 group-hover:scale-[1.03]" />
        {p.soldOut ? (
          <span className="absolute left-3 top-3 rounded-[var(--t-radius)] bg-[var(--c-surface)] px-2 py-1 text-xs font-semibold text-[var(--c-text)]">{t.soldOut}</span>
        ) : p.compareAtCents && p.compareAtCents > p.priceCents ? (
          <span className="absolute left-3 top-3 rounded-[var(--t-radius)] bg-[var(--c-accent)] px-2 py-1 text-xs font-semibold text-[var(--c-accent-text)]">−{Math.round((1 - p.priceCents / p.compareAtCents) * 100)} %</span>
        ) : null}
        <FavoriteButton slug={store.slug} productId={p.id} title={p.title} />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="font-medium leading-snug">{p.title}</span>
        {p.rating && <span className="flex items-center gap-1.5 text-xs text-[var(--c-muted)]"><Stars value={p.rating.avg} size="text-xs" locale={locale} />({p.rating.count})</span>}
        <span className="flex items-baseline gap-2 text-sm">
          <span>{p.maxPriceCents > p.priceCents ? t.from(money(p.priceCents)) : money(p.priceCents)}</span>
          {p.compareAtCents && p.compareAtCents > p.priceCents && <s className="text-[var(--c-muted)]">{money(p.compareAtCents)}</s>}
        </span>
      </div>
    </a>
  );
}

export function ProductGrid({ products, store, locale = "fr" }: { products: CardProduct[]; store: StoreInfo; locale?: Locale }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => <ProductCard key={p.id} p={p} store={store} locale={locale} />)}
    </div>
  );
}
