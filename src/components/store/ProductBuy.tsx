"use client";

import { useMemo, useState } from "react";
import { Thumb } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { useCart } from "./cart";
import { Stars } from "./Stars";

type V = { id: string; title: string; optionValues: string[]; priceCents: number; compareAtCents: number | null; stock: number };

export function ProductBuy({ slug, currency, rate = 1, title, description, images, hue, options, variants, rating, isGiftCard, preorder, contents = [] }: {
  slug: string; currency: string; rate?: number; title: string; description: string; images: string[]; hue: number; rating?: { avg: number; count: number } | null; isGiftCard?: boolean; preorder?: boolean; contents?: string[];
  options: { name: string; values: string[] }[]; variants: V[];
}) {
  const { add, items } = useCart(slug);
  const firstAvailable = variants.find((v) => v.stock > 0) ?? variants[0];
  const [picked, setPicked] = useState<string[]>(firstAvailable.optionValues);
  const [qty, setQty] = useState(1);
  const [image, setImage] = useState(0);
  const [added, setAdded] = useState(false);

  const variant = useMemo(() => variants.find((v) => v.optionValues.every((x, i) => x === picked[i])) ?? null, [variants, picked]);
  const inCart = variant ? items.find((i) => i.variantId === variant.id)?.quantity ?? 0 : 0;
  const isPreorder = Boolean(preorder && variant && variant.stock - inCart <= 0);
  const left = variant ? (preorder ? 99 - inCart : variant.stock - inCart) : 0;
  const shown = variant ?? firstAvailable;

  const valueState = (optIndex: number, value: string) => {
    const candidate = picked.map((p, i) => (i === optIndex ? value : p));
    const v = variants.find((x) => x.optionValues.every((y, i) => y === candidate[i]));
    return !v ? "missing" : v.stock <= 0 ? "soldout" : "ok";
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 md:grid-cols-[1.1fr_1fr] md:py-14">
      <div className="flex flex-col gap-3">
        <div className="overflow-hidden rounded-[var(--t-radius)]">
          <Thumb image={images[image]} hue={hue} title={title} rounded="" className="aspect-square w-full text-6xl" />
        </div>
        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto">
            {images.map((src, i) => (
              <button key={src} type="button" onClick={() => setImage(i)} aria-label={`Photo ${i + 1}`} className={`h-20 w-20 shrink-0 overflow-hidden rounded-[var(--t-radius)] border-2 ${i === image ? "border-[var(--c-text)]" : "border-transparent opacity-70"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6 md:sticky md:top-24 md:self-start">
        <div className="flex flex-col gap-2">
          <h1 className="font-[family-name:var(--t-display)] text-3xl font-semibold leading-tight md:text-4xl">{title}</h1>
          {rating && <a href="#avis" className="flex items-center gap-2 text-sm text-[var(--c-muted)] hover:underline"><Stars value={rating.avg} />{rating.avg.toFixed(1).replace(".", ",")} · {rating.count} avis</a>}
          <div className="flex items-baseline gap-3 text-xl">
            <span>{formatMoney(Math.round(shown.priceCents * rate), currency)}</span>
            {shown.compareAtCents && shown.compareAtCents > shown.priceCents && <s className="text-base text-[var(--c-muted)]">{formatMoney(Math.round(shown.compareAtCents * rate), currency)}</s>}
          </div>
        </div>

        {options.map((o, oi) => (
          <fieldset key={o.name} className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">{o.name} : <span className="font-normal text-[var(--c-muted)]">{picked[oi]}</span></legend>
            <div className="flex flex-wrap gap-2">
              {o.values.map((val) => {
                const st = preorder ? (valueState(oi, val) === "missing" ? "missing" : "ok") : valueState(oi, val);
                const active = picked[oi] === val;
                return (
                  <button
                    key={val}
                    type="button"
                    disabled={st === "missing"}
                    onClick={() => { setPicked((p) => p.map((x, i) => (i === oi ? val : x))); setQty(1); setAdded(false); }}
                    aria-pressed={active}
                    className={`min-w-12 rounded-[var(--t-radius)] border px-4 py-2 text-sm transition disabled:opacity-30 ${active ? "border-[var(--c-text)] bg-[var(--c-text)] text-[var(--c-bg)]" : "border-[color-mix(in_srgb,var(--c-text)_25%,transparent)] hover:border-[var(--c-text)]"} ${st === "soldout" ? "line-through decoration-1" : ""}`}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_25%,transparent)]">
            <button type="button" className="h-12 w-11 text-lg" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Moins">−</button>
            <span className="w-8 text-center tabular-nums" aria-live="polite">{qty}</span>
            <button type="button" className="h-12 w-11 text-lg" onClick={() => setQty((q) => Math.min(Math.max(1, left), q + 1))} aria-label="Plus">+</button>
          </div>
          <button
            type="button"
            disabled={!variant || left <= 0}
            onClick={() => { if (variant) { add(variant.id, Math.min(qty, left)); setAdded(true); setQty(1); } }}
            className="h-12 flex-1 rounded-[var(--t-radius)] bg-[var(--c-accent)] px-6 font-semibold text-[var(--c-accent-text)] transition hover:opacity-90 disabled:opacity-40"
          >
            {!variant ? "Indisponible" : isPreorder ? "Précommander" : variant.stock <= 0 ? "Épuisé" : left <= 0 ? "Tout le stock est dans votre panier" : "Ajouter au panier"}
          </button>
        </div>
        {added && (
          <p role="status" className="text-sm">Ajouté au panier. <a href={`/s/${slug}/cart`} className="font-semibold underline underline-offset-4">Voir le panier</a></p>
        )}
        {contents.length > 0 && (
          <div className="rounded-[var(--t-radius)] bg-[var(--c-surface)] p-4">
            <p className="mb-2 text-sm font-semibold">Ce lot contient</p>
            <ul className="list-disc pl-5 text-sm text-[var(--c-muted)]">{contents.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        )}
        {isPreorder && <p className="text-sm text-[var(--c-muted)]">En précommande : expédié dès le réapprovisionnement.</p>}
        {isGiftCard && <p className="text-sm text-[var(--c-muted)]">Carte cadeau envoyée par e-mail juste après le paiement, utilisable sur toute la boutique.</p>}
        {!isGiftCard && !preorder && variant && variant.stock > 0 && variant.stock <= 5 && <p className="text-sm text-[var(--c-muted)]">Plus que {variant.stock} en stock.</p>}

        {description && <div className="whitespace-pre-line border-t border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] pt-6 leading-relaxed text-[var(--c-muted)]">{description}</div>}
      </div>
    </div>
  );
}
