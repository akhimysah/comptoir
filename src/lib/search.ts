import "server-only";
import { db } from "./db";
import { getCatalog } from "./storefront";

/** Sans accents ni majuscules : « ceramique » trouve « Céramique ». */
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const searchTerms = (q: string) => norm(q).split(/\s+/).filter(Boolean).slice(0, 8);

/** Produits dont le titre ou la description contient tous les mots ; ceux qui les ont dans le titre d'abord. */
export async function searchProducts(storeId: string, q: string) {
  const terms = searchTerms(q);
  if (!terms.length) return [];
  const { products } = await getCatalog(storeId);
  const texts = new Map((await db.product.findMany({ where: { storeId, status: "active" }, select: { id: true, title: true, description: true } })).map((p) => [p.id, norm(`${p.title} ${p.description}`)]));
  const inTitle = (title: string) => terms.every((t) => norm(title).includes(t));
  const startsTitle = (title: string) => norm(title).startsWith(terms[0]);
  return products
    .filter((p) => terms.every((t) => (texts.get(p.id) ?? norm(p.title)).includes(t)))
    .sort((a, b) => Number(inTitle(b.title)) - Number(inTitle(a.title)) || Number(startsTitle(b.title)) - Number(startsTitle(a.title)) || Number(a.soldOut) - Number(b.soldOut));
}

/** Suggestions de la recherche prédictive : produits, collections et pages / articles. */
export async function suggest(storeId: string, q: string) {
  const terms = searchTerms(q);
  if (!terms.length) return { products: [], collections: [], pages: [] };
  const match = (s: string) => terms.every((t) => norm(s).includes(t));
  const [products, { collections }, pages, posts] = await Promise.all([
    searchProducts(storeId, q),
    getCatalog(storeId),
    db.page.findMany({ where: { storeId, published: true }, select: { title: true, handle: true } }),
    db.blogPost.findMany({ where: { storeId, published: true }, select: { title: true, handle: true } }),
  ]);
  return {
    products: products.slice(0, 5),
    collections: collections.filter((c) => match(c.title)).slice(0, 3),
    pages: [...pages.filter((p) => match(p.title)).map((p) => ({ title: p.title, path: `/pages/${p.handle}` })), ...posts.filter((p) => match(p.title)).map((p) => ({ title: p.title, path: `/blog/${p.handle}` }))].slice(0, 3),
  };
}
