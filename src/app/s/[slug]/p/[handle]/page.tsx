import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductBuy } from "@/components/store/ProductBuy";
import { Reviews } from "@/components/store/Reviews";
import { ProductGrid } from "@/components/store/ProductCard";
import { getCatalog } from "@/lib/storefront";
import type { Store } from "@prisma/client";
import { db } from "@/lib/db";
import { getStore } from "@/lib/storefront";
import { parseJson } from "@/lib/utils";

async function load(slug: string, handle: string) {
  const { store } = await getStore(slug);
  const product = await db.product.findUnique({ where: { storeId_handle: { storeId: store.id, handle } }, include: { variants: { orderBy: { position: "asc" } } } });
  if (!product || product.status !== "active" || !product.variants.length) notFound();
  return { store, product };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; handle: string }> }): Promise<Metadata> {
  const { slug, handle } = await params;
  const { product } = await load(slug, handle);
  const description = product.seoDescription || product.description.slice(0, 160) || undefined;
  const image = parseJson<string[]>(product.images, [])[0];
  return { title: product.seoTitle || product.title, description, openGraph: { title: product.seoTitle || product.title, description, ...(image ? { images: [image] } : {}) } };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string; handle: string }> }) {
  const { slug, handle } = await params;
  const { store, product } = await load(slug, handle);
  const agg = await db.review.aggregate({ where: { productId: product.id, status: "published" }, _avg: { rating: true }, _count: true });
  return (
    <>
    <ProductBuy
      slug={slug}
      currency={store.currency}
      title={product.title}
      description={product.description}
      images={parseJson(product.images, [])}
      hue={product.hue}
      rating={agg._count ? { avg: agg._avg.rating ?? 0, count: agg._count } : null}
      options={parseJson(product.options, [])}
      variants={product.variants.map((v) => ({ id: v.id, title: v.title, optionValues: parseJson(v.optionValues, []), priceCents: v.priceCents, compareAtCents: v.compareAtCents, stock: product.isGiftCard ? 99 : v.stock }))}
      isGiftCard={product.isGiftCard}
    />
    <Related slug={slug} storeId={store.id} productId={product.id} store={store} />
    <Reviews slug={slug} productId={product.id} />
    </>
  );
}

/** « Vous aimerez aussi » : produits des mêmes collections d'abord, puis les plus récents. */
async function Related({ slug, storeId, productId, store }: { slug: string; storeId: string; productId: string; store: Store }) {
  const { products } = await getCatalog(storeId);
  const me = products.find((p) => p.id === productId);
  const shared = (p: (typeof products)[number]) => p.collectionHandles.filter((h) => me?.collectionHandles.includes(h)).length;
  const list = products.filter((p) => p.id !== productId && !p.soldOut).sort((a, b) => shared(b) - shared(a)).slice(0, 4);
  if (!list.length) return null;
  return (
    <section className="mx-auto max-w-6xl border-t border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] px-4 py-12" data-slug={slug}>
      <h2 className="mb-6 font-[family-name:var(--t-display)] text-2xl font-semibold md:text-3xl">Vous aimerez aussi</h2>
      <ProductGrid products={list} store={store} />
    </section>
  );
}
