import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductBuy } from "@/components/store/ProductBuy";
import { Reviews } from "@/components/store/Reviews";
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
      variants={product.variants.map((v) => ({ id: v.id, title: v.title, optionValues: parseJson(v.optionValues, []), priceCents: v.priceCents, compareAtCents: v.compareAtCents, stock: v.stock }))}
    />
    <Reviews slug={slug} productId={product.id} />
    </>
  );
}
