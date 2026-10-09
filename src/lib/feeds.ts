import "server-only";
import { db } from "./db";
import { appUrl } from "./stripe";
import { parseJson } from "./utils";

export type FeedItem = {
  id: string; groupId: string; title: string; description: string; link: string; image: string | null;
  price: string; salePrice: string | null; availability: "in stock" | "out of stock"; brand: string; sku: string;
};

/** Une ligne par variante, au format attendu par Google Merchant Center et Meta Commerce Manager. */
export async function feedItems(slug: string) {
  const store = await db.store.findUnique({ where: { slug } });
  if (!store) return null;
  const products = await db.product.findMany({ where: { storeId: store.id, status: "active", isGiftCard: false }, include: { variants: { orderBy: { position: "asc" } } } });
  const base = appUrl();
  const money = (c: number) => `${(c / 100).toFixed(2)} ${store.currency}`;
  const abs = (u: string | undefined) => (u ? (u.startsWith("http") ? u : `${base}${u}`) : null);
  const items: FeedItem[] = products.flatMap((p) => {
    const img = abs(parseJson<string[]>(p.images, [])[0]);
    const desc = (p.seoDescription || p.description || p.title).replace(/[#*\[\]]/g, "").slice(0, 4900);
    return p.variants.map((v) => {
      const onSale = v.compareAtCents && v.compareAtCents > v.priceCents;
      return {
        id: v.id, groupId: p.id, title: `${p.title}${v.title !== "Par défaut" ? ` – ${v.title}` : ""}`.slice(0, 150), description: desc,
        link: `${base}/s/${slug}/p/${p.handle}`, image: img,
        price: money(onSale ? v.compareAtCents! : v.priceCents), salePrice: onSale ? money(v.priceCents) : null,
        availability: v.stock > 0 ? "in stock" : "out of stock", brand: store.name, sku: v.sku,
      };
    });
  });
  return { store, items };
}
