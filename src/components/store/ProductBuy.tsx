"use client";

import { useEffect, useMemo, useState } from "react";
import { Thumb } from "@/components/ui";
import { dict, intlLocale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { useCart } from "./cart";
import { useLocale } from "./locale";
import { Stars } from "./Stars";
import { FavoriteButton } from "./FavoriteButton";

const SUB = ":abonnement";

const T = dict(
  {
    photo: (n: number) => `Photo ${n}`,
    decimal: ",",
    reviews: (n: number) => `${n} avis`,
    option: (name: string) => `${name} : `,
    subscribe: (weekly: boolean) => `S'abonner · livré ${weekly ? "toutes les semaines" : "tous les mois"}`,
    discount: (pct: number) => `−${pct} %`,
    oneTime: "Achat unique",
    noCommitment: "Sans engagement : pause ou résiliation à tout moment depuis « Mon compte ».",
    less: "Moins",
    more: "Plus",
    unavailable: "Indisponible",
    preorder: "Précommander",
    soldOut: "Épuisé",
    allInCart: "Tout le stock est dans votre panier",
    addToCart: "Ajouter au panier",
    delivery: (from: string, to: string) => `Livraison estimée entre le ${from} et le ${to}.`,
    added: "Ajouté au panier. ",
    viewCart: "Voir le panier",
    bundle: "Ce lot contient",
    preorderNote: "En précommande : expédié dès le réapprovisionnement.",
    giftCardNote: "Carte cadeau envoyée par e-mail juste après le paiement, utilisable sur toute la boutique.",
    lowStock: (n: number) => `Plus que ${n} en stock.`,
    specs: "Caractéristiques",
    network: "Connexion impossible. Réessayez.",
    error: "Une erreur est survenue.",
    alertBefore: "C'est noté : nous vous écrirons à ",
    alertAfter: " dès que l'article sera de retour.",
    alertLabel: "Prévenez-moi du retour en stock",
    yourEmail: "Votre e-mail",
    notifyMe: "Me prévenir",
  },
  {
    photo: (n: number) => `Photo ${n}`,
    decimal: ".",
    reviews: (n: number) => `${n} review${n > 1 ? "s" : ""}`,
    option: (name: string) => `${name}: `,
    subscribe: (weekly: boolean) => `Subscribe · delivered ${weekly ? "every week" : "every month"}`,
    discount: (pct: number) => `−${pct}%`,
    oneTime: "One-time purchase",
    noCommitment: "No commitment: pause or cancel at any time from “My account”.",
    less: "Decrease quantity",
    more: "Increase quantity",
    unavailable: "Unavailable",
    preorder: "Pre-order",
    soldOut: "Sold out",
    allInCart: "All available stock is in your cart",
    addToCart: "Add to cart",
    delivery: (from: string, to: string) => `Estimated delivery between ${from} and ${to}.`,
    added: "Added to cart. ",
    viewCart: "View cart",
    bundle: "This bundle includes",
    preorderNote: "Pre-order: ships as soon as it's back in stock.",
    giftCardNote: "Gift card sent by email right after payment, valid across the whole shop.",
    lowStock: (n: number) => `Only ${n} left in stock.`,
    specs: "Specifications",
    network: "Unable to connect. Please try again.",
    error: "Something went wrong.",
    alertBefore: "Got it: we'll email you at ",
    alertAfter: " as soon as this item is back in stock.",
    alertLabel: "Notify me when it's back in stock",
    yourEmail: "Your email",
    notifyMe: "Notify me",
  },
);

type V = { id: string; title: string; optionValues: string[]; priceCents: number; compareAtCents: number | null; stock: number; image?: string | null };

export function ProductBuy({ slug, currency, rate = 1, title, description, images, hue, options, variants, rating, isGiftCard, preorder, contents = [], subscription = null, initialVariant, specs = [], productId, delivery = null, video = null }: {
  slug: string; currency: string; rate?: number; title: string; description: string; images: string[]; hue: number; rating?: { avg: number; count: number } | null; isGiftCard?: boolean; preorder?: boolean; contents?: string[]; subscription?: { interval: string; discountBps: number } | null; initialVariant?: string; specs?: { name: string; value: string }[]; productId?: string; delivery?: { from: string; to: string } | null; /** Vidéo YouTube ou Vimeo (adresse d'intégration), affichée après les photos. */ video?: string | null;
  options: { name: string; values: string[] }[]; variants: V[];
}) {
  const { add, items } = useCart(slug);
  const locale = useLocale();
  const t = T[locale];
  const loc = intlLocale(locale);
  const firstAvailable = variants.find((v) => v.stock > 0) ?? variants[0];
  const [picked, setPicked] = useState<string[]>((variants.find((v) => v.id === initialVariant) ?? firstAvailable).optionValues);
  const [qty, setQty] = useState(1);
  const startVariant = variants.find((v) => v.id === initialVariant) ?? firstAvailable;
  const [image, setImage] = useState(() => Math.max(0, startVariant.image ? images.indexOf(startVariant.image) : 0));
  const [added, setAdded] = useState(false);
  const [subscribe, setSubscribe] = useState(false);
  const subPrice = (c: number) => Math.round(c * (1 - (subscription?.discountBps ?? 0) / 10000));

  const variant = useMemo(() => variants.find((v) => v.optionValues.every((x, i) => x === picked[i])) ?? null, [variants, picked]);
  // Une variante avec sa propre photo l'affiche dès qu'elle est choisie.
  useEffect(() => {
    const i = variant?.image ? images.indexOf(variant.image) : -1;
    if (i >= 0) setImage(i);
  }, [variant, images]);
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
              <button key={src} type="button" onClick={() => setImage(i)} aria-label={t.photo(i + 1)} className={`h-20 w-20 shrink-0 overflow-hidden rounded-[var(--t-radius)] border-2 ${i === image ? "border-[var(--c-text)]" : "border-transparent opacity-70"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
        {video && <iframe src={video} title={title} className="aspect-video w-full rounded-[var(--t-radius)]" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen loading="lazy" />}
      </div>

      <div className="flex flex-col gap-6 md:sticky md:top-24 md:self-start">
        <div className="flex flex-col gap-2">
          <h1 className="font-[family-name:var(--t-display)] text-3xl font-semibold leading-tight md:text-4xl">{title}</h1>
          {rating && <a href="#avis" className="flex items-center gap-2 text-sm text-[var(--c-muted)] hover:underline"><Stars value={rating.avg} locale={locale} />{rating.avg.toFixed(1).replace(".", t.decimal)} · {t.reviews(rating.count)}</a>}
          <div className="flex items-baseline gap-3 text-xl">
            <span>{formatMoney(Math.round(shown.priceCents * rate), currency, loc)}</span>
            {shown.compareAtCents && shown.compareAtCents > shown.priceCents && <s className="text-base text-[var(--c-muted)]">{formatMoney(Math.round(shown.compareAtCents * rate), currency, loc)}</s>}
          </div>
        </div>

        {options.map((o, oi) => (
          <fieldset key={o.name} className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">{t.option(o.name)}<span className="font-normal text-[var(--c-muted)]">{picked[oi]}</span></legend>
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
                <span className="flex-1">{sub ? <>{t.subscribe(subscription.interval === "week")}{subscription.discountBps > 0 && <span className="ml-2 rounded-full bg-[var(--c-accent)] px-2 py-0.5 text-xs font-semibold text-[var(--c-accent-text)]">{t.discount(subscription.discountBps / 100)}</span>}</> : t.oneTime}</span>
                <span className="tabular-nums">{formatMoney(Math.round((sub ? subPrice(shown.priceCents) : shown.priceCents) * rate), currency, loc)}</span>
              </label>
            ))}
            {subscribe && <p className="text-xs text-[var(--c-muted)]">{t.noCommitment}</p>}
          </fieldset>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_25%,transparent)]">
            <button type="button" className="h-12 w-11 text-lg" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label={t.less}>−</button>
            <span className="w-8 text-center tabular-nums" aria-live="polite">{qty}</span>
            <button type="button" className="h-12 w-11 text-lg" onClick={() => setQty((q) => Math.min(Math.max(1, left), q + 1))} aria-label={t.more}>+</button>
          </div>
          <button
            type="button"
            disabled={!variant || left <= 0}
            onClick={() => { if (variant) { add(subscribe ? `${variant.id}${SUB}` : variant.id, Math.min(qty, left)); setAdded(true); setQty(1); } }}
            className="h-12 flex-1 rounded-[var(--t-radius)] bg-[var(--c-accent)] px-6 font-semibold text-[var(--c-accent-text)] transition hover:opacity-90 disabled:opacity-40"
          >
            {!variant ? t.unavailable : isPreorder ? t.preorder : variant.stock <= 0 ? t.soldOut : left <= 0 ? t.allInCart : t.addToCart}
          </button>
          {productId && <FavoriteButton slug={slug} productId={productId} title={title} variant="page" />}
        </div>
        {variant && variant.stock <= 0 && !preorder && !isGiftCard && contents.length === 0 && <StockAlertForm key={variant.id} slug={slug} variantId={variant.id} />}
        {added && (
          <p role="status" className="text-sm">{t.added}<a href={`/s/${slug}/cart`} className="font-semibold underline underline-offset-4">{t.viewCart}</a></p>
        )}
        {contents.length > 0 && (
          <div className="rounded-[var(--t-radius)] bg-[var(--c-surface)] p-4">
            <p className="mb-2 text-sm font-semibold">{t.bundle}</p>
            <ul className="list-disc pl-5 text-sm text-[var(--c-muted)]">{contents.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        )}
        {isPreorder && <p className="text-sm text-[var(--c-muted)]">{t.preorderNote}</p>}
        {delivery && !isGiftCard && <p className="text-sm text-[var(--c-muted)]">{t.delivery(new Date(delivery.from).toLocaleDateString(loc, { day: "numeric", month: "long" }), new Date(delivery.to).toLocaleDateString(loc, { day: "numeric", month: "long" }))}</p>}
        {isGiftCard && <p className="text-sm text-[var(--c-muted)]">{t.giftCardNote}</p>}
        {!isGiftCard && !preorder && variant && variant.stock > 0 && variant.stock <= 5 && <p className="text-sm text-[var(--c-muted)]">{t.lowStock(variant.stock)}</p>}

        {description && <div className="whitespace-pre-line border-t border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] pt-6 leading-relaxed text-[var(--c-muted)]">{description}</div>}
        {specs.length > 0 && (
          <div className="border-t border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] pt-6">
            <h2 className="mb-3 font-semibold">{t.specs}</h2>
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
  const t = T[useLocale()];
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ ok?: boolean; error?: string; pending?: boolean }>({});
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ pending: true });
    const res = await fetch(`/s/${slug}/stock-alert`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variantId, email }) }).then((r) => r.json()).catch(() => ({ error: t.network }));
    setState(res.ok ? { ok: true } : { error: res.error ?? t.error });
  };
  if (state.ok) return <p role="status" className="rounded-[var(--t-radius)] bg-[var(--c-surface)] p-4 text-sm">{t.alertBefore}<b>{email}</b>{t.alertAfter}</p>;
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-[var(--t-radius)] bg-[var(--c-surface)] p-4">
      <label htmlFor="stock-alert-email" className="text-sm font-semibold">{t.alertLabel}</label>
      <div className="flex gap-2">
        <input id="stock-alert-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.yourEmail} className="min-w-0 flex-1 rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] bg-[var(--c-bg)] px-3 py-2.5 outline-none focus:border-[var(--c-text)]" />
        <button disabled={state.pending} className="rounded-[var(--t-radius)] border border-[var(--c-text)] px-4 font-semibold disabled:opacity-50">{state.pending ? "…" : t.notifyMe}</button>
      </div>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
