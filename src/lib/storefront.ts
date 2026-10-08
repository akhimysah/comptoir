import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { CardCollection, CardProduct } from "@/components/store/types";
import { db } from "./db";
import { readTheme } from "./theme";
import { parseJson } from "./utils";

export const getStore = cache(async (slug: string) => {
  const store = await db.store.findUnique({ where: { slug } });
  if (!store) notFound();
  return { store, theme: readTheme(store.theme, store.name) };
});

export const getCatalog = cache(async (storeId: string) => {
  const [products, collections, ratings] = await Promise.all([
    db.product.findMany({
      where: { storeId, status: "active" },
      include: { variants: true, collections: { include: { collection: { select: { handle: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    db.collection.findMany({ where: { storeId }, include: { products: { where: { product: { status: "active" } } } }, orderBy: { title: "asc" } }),
    db.review.groupBy({ by: ["productId"], where: { storeId, status: "published" }, _avg: { rating: true }, _count: true }),
  ]);
  const ratingBy = new Map(ratings.map((r) => [r.productId, { avg: r._avg.rating ?? 0, count: r._count }]));
  const cards: CardProduct[] = products
    .filter((p) => p.variants.length)
    .map((p) => {
      const cheapest = p.variants.reduce((a, b) => (b.priceCents < a.priceCents ? b : a));
      return {
        id: p.id,
        handle: p.handle,
        title: p.title,
        priceCents: cheapest.priceCents,
        maxPriceCents: Math.max(...p.variants.map((v) => v.priceCents)),
        compareAtCents: cheapest.compareAtCents,
        image: parseJson<string[]>(p.images, [])[0] ?? null,
        hue: p.hue,
        soldOut: p.variants.every((v) => v.stock <= 0),
        collectionHandles: p.collections.map((c) => c.collection.handle),
        rating: ratingBy.get(p.id) ?? null,
      };
    });
  const cols: CardCollection[] = collections.map((c) => ({ handle: c.handle, title: c.title, image: c.image, count: c.products.length }));
  return { products: cards, collections: cols };
});
