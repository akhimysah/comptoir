"use client";

import { useEffect, useState } from "react";
import { dict } from "@/lib/i18n";
import { ProductGrid } from "./ProductCard";
import { useFavorites } from "./favorites";
import { useLocale } from "./locale";
import type { CardProduct, StoreInfo } from "./types";

const T = dict(
  {
    loading: "Chargement…",
    empty: "Vous n'avez pas encore de favori. Touchez le cœur d'un produit pour le retrouver ici.",
    browse: "Découvrir les produits",
    deviceOnly: "Vos favoris sont gardés sur cet appareil. ",
    login: "Connectez-vous",
    everywhere: " pour les retrouver partout.",
  },
  {
    loading: "Loading…",
    empty: "You don't have any favourites yet. Tap the heart on a product to save it here.",
    browse: "Browse products",
    deviceOnly: "Your favourites are saved on this device. ",
    login: "Log in",
    everywhere: " to access them anywhere.",
  },
);

/** Page « Mes favoris » : les produits sont chargés d'après les favoris du navigateur (synchronisés avec le compte). */
export function FavoritesList({ store, loggedIn }: { store: StoreInfo & { rate?: number }; loggedIn: boolean }) {
  const { ids } = useFavorites(store.slug);
  const locale = useLocale();
  const t = T[locale];
  const [products, setProducts] = useState<CardProduct[] | null>(null);
  useEffect(() => {
    if (!ids.length) { setProducts([]); return; }
    fetch(`/s/${store.slug}/favorites/api?cards=${ids.join(",")}`).then((r) => r.json()).then((d) => setProducts(d.products ?? [])).catch(() => setProducts([]));
  }, [ids, store.slug]);
  if (products === null) return <p className="text-[var(--c-muted)]">{t.loading}</p>;
  if (!products.length) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-[var(--c-muted)]">{t.empty}</p>
        <a href={`/s/${store.slug}/products`} className="rounded-[var(--t-radius)] bg-[var(--c-accent)] px-5 py-2.5 font-semibold text-[var(--c-accent-text)]">{t.browse}</a>
      </div>
    );
  }
  return (
    <>
      {!loggedIn && <p className="mb-6 text-sm text-[var(--c-muted)]">{t.deviceOnly}<a href={`/s/${store.slug}/account/login`} className="underline underline-offset-4">{t.login}</a>{t.everywhere}</p>}
      <ProductGrid products={products} store={store} locale={locale} />
    </>
  );
}
