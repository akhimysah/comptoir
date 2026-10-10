import { displayCurrency } from "@/lib/currency";
import type { Metadata } from "next";
import { ProductBuy } from "@/components/store/ProductBuy";
import { Reviews } from "@/components/store/Reviews";
import { ProductGrid } from "@/components/store/ProductCard";
import { getCatalog } from "@/lib/storefront";
import type { Store } from "@prisma/client";
import { db } from "@/lib/db";
import { notFoundOrRedirect } from "@/lib/navigation";
import { formatMetafield } from "@/lib/metafields";
import { complementaryProducts } from "@/lib/recommendations";
import { getStore } from "@/lib/storefront";
import { bundleStock } from "@/lib/bundles";
import { parseJson } from "@/lib/utils";
import { getCustomer } from "@/lib/customer-auth";
import { loadProPricing, proPrice } from "@/lib/b2b";

async function load(slug: string, handle: string) {
  const { store } = await getStore(slug);
  const product = await db.product.findUnique({ where: { storeId_handle: { storeId: store.id, handle } }, include: { variants: { orderBy: { position: "asc" } } } });
  if (!product || product.status !== "active" || !product.variants.length) return notFoundOrRedirect(store, `/p/${handle}`);
  return { store, product };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; handle: string }> }): Promise<Metadata> {
  const { slug, handle } = await params;
  const { product } = await load(slug, handle);
  const description = product.seoDescription || product.description.slice(0, 160) || undefined;
  const image = parseJson<string[]>(product.images, [])[0];
  return { title: product.seoTitle || product.title, description, openGraph: { title: product.seoTitle || product.title, description, ...(image ? { images: [image] } : {}) } };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string; handle: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { variant: initialVariant } = await searchParams;
  const { slug, handle } = await params;
  const { store, product } = await load(slug, handle);
  const defs = await db.metafieldDefinition.findMany({ where: { storeId: store.id, showOnProduct: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  const values = parseJson<Record<string, string>>(product.metafields, {});
  const specs = defs.flatMap((d) => { const v = formatMetafield(d, values[d.key]); return v ? [{ name: d.name, value: v }] : []; });
  const parts = await db.bundleItem.findMany({ where: { bundleId: product.id } });
  const partVariants = parts.length ? await db.variant.findMany({ where: { id: { in: parts.map((x) => x.variantId) } }, include: { product: true } }) : [];
  const bundleLeft = parts.length ? bundleStock(parts.map((x) => ({ quantity: x.quantity, stock: partVariants.find((v) => v.id === x.variantId)?.stock ?? 0 }))) : null;
  const contents = parts.map((x) => { const v = partVariants.find((pv) => pv.id === x.variantId); return v ? `${x.quantity} × ${v.product.title}${v.title !== "Par défaut" ? ` (${v.title})` : ""}` : null; }).filter((x): x is string => !!x);
  const cur = await displayCurrency(store);
  // Client professionnel connecté : ses prix, avec le prix public barré.
  const customer = product.isGiftCard ? null : await getCustomer(store.id);
  const pro = await loadProPricing(store.id, customer?.priceListId, product.variants.map((v) => v.id));
  const agg = await db.review.aggregate({ where: { productId: product.id, status: "published" }, _avg: { rating: true }, _count: true });
  return (
    <>
    <ProductBuy
      productId={product.id}
      specs={specs}
      initialVariant={initialVariant}
      slug={slug}
      currency={cur.code}
      rate={cur.rate}
      title={product.title}
      description={product.description}
      images={parseJson(product.images, [])}
      hue={product.hue}
      rating={agg._count ? { avg: agg._avg.rating ?? 0, count: agg._count } : null}
      options={parseJson(product.options, [])}
      variants={product.variants.map((v) => ({ id: v.id, title: v.title, optionValues: parseJson(v.optionValues, []), priceCents: proPrice(v.priceCents, v.id, pro), compareAtCents: proPrice(v.priceCents, v.id, pro) < v.priceCents ? v.priceCents : v.compareAtCents, stock: product.isGiftCard ? 99 : bundleLeft ?? v.stock, image: v.image }))}
      contents={contents}
      preorder={product.continueSelling}
      subscription={product.subscriptionInterval ? { interval: product.subscriptionInterval, discountBps: product.subscriptionDiscountBps } : null}
      isGiftCard={product.isGiftCard}
    />
    <Related slug={slug} storeId={store.id} productId={product.id} store={{ ...store, currency: cur.code, rate: cur.rate }} />
    <Reviews slug={slug} productId={product.id} />
    </>
  );
}

/** « Vous aimerez aussi » : produits des mêmes collections d'abord, puis les plus récents. */
async function Related({ slug, storeId, productId, store }: { slug: string; storeId: string; productId: string; store: Store & { rate?: number } }) {
  const { products } = await getCatalog(storeId);
  const me = products.find((p) => p.id === productId);
  const together = await complementaryProducts(storeId, [productId], 4);
  const shared = (p: (typeof products)[number]) => p.collectionHandles.filter((h) => me?.collectionHandles.includes(h)).length;
  const list = products.filter((p) => p.id !== productId && !p.soldOut && !together.some((t) => t.id === p.id)).sort((a, b) => shared(b) - shared(a)).slice(0, 4);
  if (!list.length && !together.length) return null;
  return (
    <>
    {together.length > 0 && (
      <section className="mx-auto max-w-6xl border-t border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] px-4 py-12">
        <h2 className="mb-6 font-[family-name:var(--t-display)] text-2xl font-semibold md:text-3xl">Souvent achetés ensemble</h2>
        <ProductGrid products={together} store={store} />
      </section>
    )}
    {list.length > 0 && <section className="mx-auto max-w-6xl border-t border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] px-4 py-12" data-slug={slug}>
      <h2 className="mb-6 font-[family-name:var(--t-display)] text-2xl font-semibold md:text-3xl">Vous aimerez aussi</h2>
      <ProductGrid products={list} store={store} />
    </section>}
    </>
  );
}
