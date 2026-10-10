"use client";

import { useMemo, useState } from "react";
import { Thumb } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { useCart } from "./cart";
import { Stars } from "./Stars";
import { FavoriteButton } from "./FavoriteButton";

const SUB = ":abonnement";

type V = { id: string; title: string; optionValues: string[]; priceCents: number; compareAtCents: number | null; stock: number };

export function ProductBuy({ slug, currency, rate = 1, title, description, images, hue, options, variants, rating, isGiftCard, preorder, contents = [], subscription = null, initialVariant, specs = [], productId }: {
  slug: string; currency: string; rate?: number; title: string; description: string; images: string[]; hue: number; rating?: { avg: number; count: number } | null; isGiftCard?: boolean; preorder?: boolean; contents?: string[]; subscription?: { interval: string; discountBps: number } | null; initialVariant?: string; specs?: { name: string; value: string }[]; productId?: string;
  options: { name: string; values: string[] }[]; variants: V[];
}) {
  const { add, items } = useCart(slug);
  const firstAvailable = variants.find((v) => v.stock > 0) ?? variants[0];
  const [picked, setPicked] = useState<string[]>((variants.find((v) => v.id === initialVariant) ?? firstAvailable).optionValues);
  const [qty, setQty] = useState(1);
  const [image, setImage] = useState(0);
  const [added, setAdded] = useState(false);
  const [subscribe, setSubscribe] = useState(false);
  const subPrice = (c: number) => Math.round(c * (1 - (subscription?.discountBps ?? 0) / 10000));

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

        {subscription && (
          <fieldset className="flex flex-col gap-2">
            {[false, true].map((sub) => (
              <label key={String(sub)} className={`flex cursor-pointer items-center gap-3 rounded-[var(--t-radius)] border px-4 py-3 ${subscribe === sub ? "border-[var(--c-text)]" : "border-[color-mix(in_srgb,var(--c-text)_22%,transparent)]"}`}>
                <input type="radio" name="purchase" checked={subscribe === sub} onChange={() => setSubscribe(sub)} />
                <span className="flex-1">{sub ? <>S'abonner · livré {subscription.interval === "week" ? "toutes les semaines" : "tous les mois"}{subscription.discountBps > 0 && <span className="ml-2 rounded-full bg-[var(--c-accent)] px-2 py-0.5 text-xs font-semibold text-[var(--c-accent-text)]">−{subscription.discountBps / 100} %</span>}</> : "Achat unique"}</span>
                <span className="tabular-nums">{formatMoney(Math.round((sub ? subPrice(shown.priceCents) : shown.priceCents) * rate), currency)}</span>
              </label>
            ))}
            {subscribe && <p className="text-xs text-[var(--c-muted)]">Sans engagement : pause ou résiliation à tout moment depuis « Mon compte ».</p>}
          </fieldset>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_25%,transparent)]">
            <button type="button" className="h-12 w-11 text-lg" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Moins">−</button>
            <span className="w-8 text-center tabular-nums" aria-live="polite">{qty}</span>
            <button type="button" className="h-12 w-11 text-lg" onClick={() => setQty((q) => Math.min(Math.max(1, left), q + 1))} aria-label="Plus">+</button>
          </div>
          <button
            type="button"
            disabled={!variant || left <= 0}
            onClick={() => { if (variant) { add(subscribe ? `${variant.id}${SUB}` : variant.id, Math.min(qty, left)); setAdded(true); setQty(1); } }}
            className="h-12 flex-1 rounded-[var(--t-radius)] bg-[var(--c-accent)] px-6 font-semibold text-[var(--c-accent-text)] transition hover:opacity-90 disabled:opacity-40"
          >
            {!variant ? "Indisponible" : isPreorder ? "Précommander" : variant.stock <= 0 ? "Épuisé" : left <= 0 ? "Tout le stock est dans votre panier" : "Ajouter au panier"}
          </button>
          {productId && <FavoriteButton slug={slug} productId={productId} title={title} variant="page" />}
        </div>
        {variant && variant.stock <= 0 && !preorder && !isGiftCard && contents.length === 0 && <StockAlertForm key={variant.id} slug={slug} variantId={variant.id} />}
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
        {specs.length > 0 && (
          <div className="border-t border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] pt-6">
            <h2 className="mb-3 font-semibold">Caractéristiques</h2>
            <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-6 gap-y-2 text-sm">
              {specs.map((s) => <div key={s.name} className="contents"><dt className="text-[var(--c-muted)]">{s.name}</dt><dd className="whitespace-pre-line">{s.value}</dd></div>)}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

/** « Me prévenir » : le client laisse son e-mail pour être averti du retour en stock de la variante choisie. */
function StockAlertForm({ slug, variantId }: { slug: string; variantId: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ ok?: boolean; error?: string; pending?: boolean }>({});
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ pending: true });
    const res = await fetch(`/s/${slug}/stock-alert`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variantId, email }) }).then((r) => r.json()).catch(() => ({ error: "Connexion impossible. Réessayez." }));
    setState(res.ok ? { ok: true } : { error: res.error ?? "Une erreur est survenue." });
  };
  if (state.ok) return <p role="status" className="rounded-[var(--t-radius)] bg-[var(--c-surface)] p-4 text-sm">C'est noté : nous vous écrirons à <b>{email}</b> dès que l'article sera de retour.</p>;
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-[var(--t-radius)] bg-[var(--c-surface)] p-4">
      <label htmlFor="stock-alert-email" className="text-sm font-semibold">Prévenez-moi du retour en stock</label>
      <div className="flex gap-2">
        <input id="stock-alert-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Votre e-mail" className="min-w-0 flex-1 rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] bg-[var(--c-bg)] px-3 py-2.5 outline-none focus:border-[var(--c-text)]" />
        <button disabled={state.pending} className="rounded-[var(--t-radius)] border border-[var(--c-text)] px-4 font-semibold disabled:opacity-50">{state.pending ? "…" : "Me prévenir"}</button>
      </div>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
