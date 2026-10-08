export type CardProduct = {
  id: string;
  handle: string;
  title: string;
  priceCents: number;
  maxPriceCents: number;
  compareAtCents: number | null;
  image: string | null;
  hue: number;
  soldOut: boolean;
  collectionHandles: string[];
  rating: { avg: number; count: number } | null;
};

export type CardCollection = { handle: string; title: string; image: string | null; count: number };

export type StoreInfo = { slug: string; name: string; currency: string };

export function storeHref(slug: string, link: string) {
  if (!link) return `/s/${slug}`;
  if (/^https?:\/\//.test(link)) return link;
  return `/s/${slug}${link.startsWith("/") ? link : `/${link}`}`;
}
