"use client";

import { useCart } from "./cart";

export function CartLink({ slug }: { slug: string }) {
  const { count } = useCart(slug);
  return (
    <a href={`/s/${slug}/cart`} className="relative inline-flex items-center gap-2 rounded-[var(--t-radius)] px-2 py-1.5 font-medium hover:opacity-75" aria-label={`Panier, ${count} article${count > 1 ? "s" : ""}`}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 8h14l-1.2 11.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9zM9 8V6a3 3 0 0 1 6 0v2" /></svg>
      <span className="hidden sm:inline">Panier</span>
      {count > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--c-accent)] px-1 text-[0.7rem] font-semibold text-[var(--c-accent-text)]">{count}</span>}
    </a>
  );
}
