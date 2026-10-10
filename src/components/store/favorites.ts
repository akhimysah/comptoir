"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Favoris : gardés dans le navigateur pour tous, et synchronisés avec le compte quand le client est connecté
 * (les favoris ajoutés avant la connexion sont fusionnés au compte).
 */
const EVENT = "comptoir:favorites";
const key = (slug: string) => `comptoir:fav:${slug}`;
const empty: string[] = [];
const cache = new Map<string, string[]>();
const synced = new Map<string, Promise<boolean>>();

function read(slug: string): string[] {
  if (cache.has(slug)) return cache.get(slug)!;
  let v: string[] = [];
  try { v = JSON.parse(localStorage.getItem(key(slug)) ?? "[]"); } catch {}
  if (!Array.isArray(v)) v = [];
  cache.set(slug, v);
  return v;
}
function write(slug: string, ids: string[]) {
  const v = [...new Set(ids)].slice(0, 100);
  cache.set(slug, v);
  try { localStorage.setItem(key(slug), JSON.stringify(v)); } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** Une seule synchronisation par page : renvoie true si le client est connecté. */
function sync(slug: string) {
  if (!synced.has(slug)) {
    synced.set(slug, (async () => {
      const r = await fetch(`/s/${slug}/favorites/api`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      if (!r?.loggedIn) return false;
      const local = read(slug);
      const merged = local.some((id) => !r.ids.includes(id))
        ? await fetch(`/s/${slug}/favorites/api`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "merge", ids: local }) }).then((x) => x.json()).catch(() => r)
        : r;
      write(slug, merged.ids);
      return true;
    })());
  }
  return synced.get(slug)!;
}

export function useFavorites(slug: string) {
  const ids = useSyncExternalStore(
    (cb) => { window.addEventListener(EVENT, cb); window.addEventListener("storage", cb); return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); }; },
    () => read(slug),
    () => empty,
  );
  useEffect(() => { sync(slug); }, [slug]);
  const toggle = useCallback(async (productId: string) => {
    const on = !read(slug).includes(productId);
    write(slug, on ? [productId, ...read(slug)] : read(slug).filter((x) => x !== productId));
    if (await sync(slug)) {
      await fetch(`/s/${slug}/favorites/api`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set", productId, on }) }).catch(() => null);
    }
  }, [slug]);
  return { ids, toggle, has: (id: string) => ids.includes(id) };
}
