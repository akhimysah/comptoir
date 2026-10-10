"use client";

import { useEffect, useState } from "react";
import { ProductGrid } from "./ProductCard";
import { useFavorites } from "./favorites";
import type { CardProduct, StoreInfo } from "./types";

/** Page « Mes favoris » : les produits sont chargés d'après les favoris du navigateur (synchronisés avec le compte). */
export function FavoritesList({ store, loggedIn }: { store: StoreInfo & { rate?: number }; loggedIn: boolean }) {
  const { ids } = useFavorites(store.slug);
  const [products, setProducts] = useState<CardProduct[] | null>(null);
  useEffect(() => {
    if (!ids.length) { setProducts([]); return; }
    fetch(`/s/${store.slug}/favorites/api?cards=${ids.join(",")}`).then((r) => r.json()).then((d) => setProducts(d.products ?? [])).catch(() => setProducts([]));
  }, [ids, store.slug]);
  if (products === null) return <p className="text-[var(--c-muted)]">Chargement…</p>;
  if (!products.length) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-[var(--c-muted)]">Vous n'avez pas encore de favori. Touchez le cœur d'un produit pour le retrouver ici.</p>
        <a href={`/s/${store.slug}/products`} className="rounded-[var(--t-radius)] bg-[var(--c-accent)] px-5 py-2.5 font-semibold text-[var(--c-accent-text)]">Découvrir les produits</a>
      </div>
    );
  }
  return (
    <>
      {!loggedIn && <p className="mb-6 text-sm text-[var(--c-muted)]">Vos favoris sont gardés sur cet appareil. <a href={`/s/${store.slug}/account/login`} className="underline underline-offset-4">Connectez-vous</a> pour les retrouver partout.</p>}
      <ProductGrid products={products} store={store} />
    </>
  );
}
