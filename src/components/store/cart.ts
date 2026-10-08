"use client";

import { useCallback, useSyncExternalStore } from "react";

export type CartItem = { variantId: string; quantity: number };

const keyFor = (slug: string) => `comptoir:cart:${slug}`;
const EVENT = "comptoir-cart";

function read(slug: string): CartItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(keyFor(slug)) ?? "[]");
    return Array.isArray(v) ? v.filter((i) => i && typeof i.variantId === "string" && i.quantity > 0) : [];
  } catch {
    return [];
  }
}

const cache = new Map<string, { raw: string | null; items: CartItem[] }>();
function snapshot(slug: string) {
  let raw: string | null = null;
  try { raw = localStorage.getItem(keyFor(slug)); } catch {}
  const hit = cache.get(slug);
  if (hit && hit.raw === raw) return hit.items;
  const items = read(slug);
  cache.set(slug, { raw, items });
  return items;
}

function write(slug: string, items: CartItem[]) {
  try { localStorage.setItem(keyFor(slug), JSON.stringify(items.filter((i) => i.quantity > 0))); } catch {}
  window.dispatchEvent(new Event(EVENT));
}

const EMPTY: CartItem[] = [];
const noopSubscribe = () => () => {};

/** Panier stocké dans le navigateur, partagé entre l'en-tête, la fiche produit et la page panier. */
export function useCart(slug: string) {
  const items = useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb);
      window.addEventListener("storage", cb);
      return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
    },
    () => snapshot(slug),
    () => EMPTY,
  );

  const add = useCallback((variantId: string, quantity: number) => {
    const cur = read(slug);
    const hit = cur.find((i) => i.variantId === variantId);
    write(slug, hit ? cur.map((i) => (i === hit ? { ...i, quantity: Math.min(99, i.quantity + quantity) } : i)) : [...cur, { variantId, quantity }]);
  }, [slug]);
  const setQuantity = useCallback((variantId: string, quantity: number) => {
    write(slug, read(slug).map((i) => (i.variantId === variantId ? { ...i, quantity: Math.max(0, Math.min(99, quantity)) } : i)));
  }, [slug]);
  const replace = useCallback((next: CartItem[]) => write(slug, next), [slug]);
  const clear = useCallback(() => write(slug, []), [slug]);

  // false pendant le rendu serveur et la première hydratation : le panier du navigateur n'est pas encore lu.
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);

  return { items, ready, count: items.reduce((s, i) => s + i.quantity, 0), add, setQuantity, replace, clear };
}
