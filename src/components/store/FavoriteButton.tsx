"use client";

import { dict } from "@/lib/i18n";
import { useFavorites } from "./favorites";
import { useLocale } from "./locale";

const T = dict(
  { remove: (title: string) => `Retirer ${title} des favoris`, add: (title: string) => `Ajouter ${title} aux favoris` },
  { remove: (title: string) => `Remove ${title} from favourites`, add: (title: string) => `Add ${title} to favourites` },
);

/** Cœur « Ajouter aux favoris ». Dans une carte produit (lien), le clic n'ouvre pas la fiche. */
export function FavoriteButton({ slug, productId, title, variant = "card" }: { slug: string; productId: string; title: string; variant?: "card" | "page" }) {
  const { has, toggle } = useFavorites(slug);
  const t = T[useLocale()];
  const on = has(productId);
  const label = on ? t.remove(title) : t.add(title);
  const heart = <svg viewBox="0 0 24 24" className="h-5 w-5" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>;
  if (variant === "page") {
    return (
      <button type="button" onClick={() => toggle(productId)} aria-pressed={on} aria-label={label} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] text-[var(--c-accent)] hover:border-[var(--c-text)]">
        {heart}
      </button>
    );
  }
  return (
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(productId); }} aria-pressed={on} aria-label={label} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-[var(--c-bg)]/90 text-[var(--c-accent)] shadow-sm transition hover:scale-110">
      {heart}
    </button>
  );
}
