import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { CardCollection, CardProduct } from "@/components/store/types";
import { db } from "./db";
import { bundleComponents, bundleStock } from "./bundles";
import { readTheme, translateTheme } from "./theme";
import { readTranslations, translate, type Locale } from "./i18n";
import { getLocale } from "./locale";
import { storeAccess } from "./store-access";
import { parseJson } from "./utils";
import { formatMetafield } from "./metafields";

/** Boutique sans contrôle d'accès : réservé à la mise en page, qui affiche elle-même la page « mot de passe ». */
export const getStoreUngated = cache(async (slug: string) => {
  const raw = await db.store.findUnique({ where: { slug } });
  if (!raw) notFound();
  // Langue du visiteur : textes de la boutique et du thème traduits par le marchand.
  const locale = await getLocale(raw);
  const store = translate(raw, locale, ["tagline", "passwordMessage"]);
  const theme = readTheme(store.theme, store.name);
  return { store, theme: locale === "fr" ? theme : translateTheme(theme, readTranslations(raw.translations)[locale]), locale };
});

/** Boutique pour les pages : une boutique protégée par mot de passe ne livre aucune donnée sans accès. */
export const getStore = cache(async (slug: string) => {
  const res = await getStoreUngated(slug);
  if (!(await storeAccess(res.store)).allowed) notFound();
  return res;
});

export const getCatalog = cache(async (storeId: string, locale: Locale = "fr") => {
  const [products, collections, ratings] = await Promise.all([
    db.product.findMany({
      where: { storeId, status: "active" },
      include: { variants: true, collections: { include: { collection: { select: { handle: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    db.collection.findMany({ where: { storeId }, include: { products: { where: { product: { status: "active" } } } }, orderBy: { title: "asc" } }),
    db.review.groupBy({ by: ["productId"], where: { storeId, status: "published" }, _avg: { rating: true }, _count: true }),
  ]);
  // Champs personnalisés « filtrables » : ajoutés aux options pour apparaître dans les filtres de la boutique.
  const filterDefs = await db.metafieldDefinition.findMany({ where: { storeId, filterable: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  const ratingBy = new Map(ratings.map((r) => [r.productId, { avg: r._avg.rating ?? 0, count: r._count }]));
  const bundles = await bundleComponents(products.map((p) => p.id));
  const cards: CardProduct[] = products
    .filter((p) => p.variants.length)
    .map((p) => {
      const cheapest = p.variants.reduce((a, b) => (b.priceCents < a.priceCents ? b : a));
      return {
        id: p.id,
        handle: p.handle,
        title: translate(p, locale, ["title"]).title,
        priceCents: cheapest.priceCents,
        maxPriceCents: Math.max(...p.variants.map((v) => v.priceCents)),
        compareAtCents: cheapest.compareAtCents,
        image: parseJson<string[]>(p.images, [])[0] ?? null,
        hue: p.hue,
        soldOut: !p.isGiftCard && !p.continueSelling && (bundles.has(p.id) ? bundleStock(bundles.get(p.id)!) <= 0 : p.variants.every((v) => v.stock <= 0)),
        collectionHandles: p.collections.map((c) => c.collection.handle),
        rating: ratingBy.get(p.id) ?? null,
        // Les montants d'une carte cadeau ne sont pas un critère de filtre.
        options: (p.isGiftCard ? [] : parseJson<{ name: string; values: string[] }[]>(p.options, [])).map((o, idx) => ({
          name: o.name.trim(),
          values: [...new Set(p.variants.map((v) => parseJson<string[]>(v.optionValues, [])[idx]).filter((x): x is string => !!x).map((x) => x.trim()))],
        })).filter((o) => o.name && o.values.length).concat(filterDefs.flatMap((d) => {
          const raw = parseJson<Record<string, string>>(p.metafields, {})[d.key];
          if (d.type === "boolean") return raw === "true" ? [{ name: d.name, values: [locale === "en" ? "Yes" : "Oui"] }] : [];
          const shown = formatMetafield(d, raw, locale);
          return shown ? [{ name: d.name, values: [shown] }] : [];
        })),
      };
    });
  const cols: CardCollection[] = collections.map((c) => ({ handle: c.handle, title: translate(c, locale, ["title"]).title, image: c.image, count: c.products.length }));
  return { products: cards, collections: cols };
});
