"use client";

import { useCallback, useEffect, useState } from "react";
import { Thumb } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import type { PricedCart } from "@/lib/pricing";
import type { Suggestion } from "@/lib/recommendations";
import { useCart } from "./cart";

const field = "w-full rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] bg-[var(--c-surface)] px-3 py-2.5 outline-none focus:border-[var(--c-text)]";

type Recovered = { items: { variantId: string; quantity: number }[]; email: string; name: string; token: string } | null;

export function CartView({ slug, currency, display, loyalty, cancelled, demo, recovered, customer }: { slug: string; currency: string; display?: { code: string; rate: number }; loyalty?: { perUnit: number } | null; cancelled: boolean; demo: boolean; recovered: Recovered; customer?: { email: string; name: string } | null }) {
  const { items, ready, setQuantity, replace, add } = useCart(slug);
  const [cart, setCart] = useState<(PricedCart & { recommendations?: Suggestion[] }) | null>(null);
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [country, setCountry] = useState("France");
  const [rateId, setRateId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [giftInput, setGiftInput] = useState("");
  const [gift, setGift] = useState("");
  const [marketing, setMarketing] = useState(false);

  // Lien « Reprendre ma commande » reçu par e-mail : on remet le panier mémorisé.
  useEffect(() => {
    if (ready && recovered && !restored) { replace(recovered.items); setRestored(true); try { localStorage.setItem(`comptoir:checkout:${slug}`, recovered.token); } catch {} }
  }, [ready, recovered, restored, replace, slug]);

  const saveCheckout = (form: HTMLFormElement | null) => {
    if (!form || !items.length) return;
    const email = String(new FormData(form).get("email") ?? "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
    const key = `comptoir:checkout:${slug}`;
    let token: string | null = null;
    try { token = localStorage.getItem(key); } catch {}
    fetch("/api/checkouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, email, name: String(new FormData(form).get("name") ?? ""), items, token }) })
      .then((r) => r.json())
      .then((r: { token?: string }) => { if (r.token) try { localStorage.setItem(key, r.token); } catch {} })
      .catch(() => {});
  };
  // Montants affichés dans la devise choisie ; le paiement se fait dans la devise de la boutique.
  const shown = display && display.code !== currency ? display : null;
  const m = (c: number) => (shown ? formatMoney(Math.round(c * shown.rate), shown.code) : formatMoney(c, currency));

  const refresh = useCallback(async () => {
    if (!ready) return;
    const res = await fetch("/api/cart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, items, code: applied, country, rateId, giftCode: gift }) });
    if (!res.ok) return;
    const priced: PricedCart & { recommendations?: Suggestion[] } = await res.json();
    setCart(priced);
    // Aligne le panier local sur ce que la boutique peut réellement fournir (article retiré, stock réduit).
    if (!priced.notices.length) return;
    const next = priced.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
    const same = next.length === items.length && next.every((n) => items.some((i) => i.variantId === n.variantId && i.quantity === n.quantity));
    if (!same) replace(next);
  }, [ready, slug, items, applied, country, rateId, gift, replace]);

  useEffect(() => { refresh(); }, [refresh]);

  async function checkout(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, country, rateId: cart?.shippingRateId ?? rateId, giftCode: gift, marketing, slug, items, code: applied }) });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.url) { window.location.href = json.url; return; }
    setError(json.error ?? "La commande n'a pas pu être créée. Réessayez.");
    if (json.refresh) refresh();
    setBusy(false);
  }

  if (cart && !cart.lines.length && !items.length) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center">
        <h1 className="font-[family-name:var(--t-display)] text-3xl font-semibold">Votre panier est vide</h1>
        {cart.notices.map((n) => <p key={n} className="text-sm text-[var(--c-muted)]">{n}</p>)}
        <a href={`/s/${slug}/products`} className="rounded-[var(--t-radius)] bg-[var(--c-accent)] px-6 py-3 font-semibold text-[var(--c-accent-text)]">Découvrir les produits</a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-6 font-[family-name:var(--t-display)] text-3xl font-semibold md:text-4xl">Panier</h1>
      {restored && <p className="mb-4 rounded-[var(--t-radius)] bg-[var(--c-surface)] px-4 py-3 text-sm">Votre panier a été retrouvé. Il ne reste plus qu'à valider la commande.</p>}
      {cancelled && <p className="mb-4 rounded-[var(--t-radius)] bg-[var(--c-surface)] px-4 py-3 text-sm">Le paiement a été interrompu. Votre panier est toujours là.</p>}
      {cart?.notices.map((n) => <p key={n} className="mb-3 rounded-[var(--t-radius)] bg-[var(--c-surface)] px-4 py-3 text-sm">{n}</p>)}

      <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex min-w-0 flex-col gap-10">
        <ul className="flex flex-col divide-y divide-[color-mix(in_srgb,var(--c-text)_12%,transparent)]">
          {!cart && <li className="py-6 text-[var(--c-muted)]">Chargement du panier…</li>}
          {cart?.lines.map((l) => (
            <li key={l.variantId} className="flex gap-4 py-5">
              <a href={`/s/${slug}/p/${l.productHandle}`}><Thumb image={l.image} hue={l.hue} title={l.productTitle} rounded="rounded-[var(--t-radius)]" className="h-24 w-20 text-lg" /></a>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <a href={`/s/${slug}/p/${l.productHandle}`} className="font-medium">{l.productTitle}</a>
                {l.variantTitle !== "Par défaut" && <span className="text-sm text-[var(--c-muted)]">{l.variantTitle}</span>}
                {l.subscription && <span className="text-sm font-medium">Abonnement · livré {l.subscription === "week" ? "toutes les semaines" : "tous les mois"}</span>}
                <span className="text-sm">{m(l.priceCents)}</span>
                <div className="mt-auto flex items-center gap-3">
                  <div className="inline-flex items-center rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)]">
                    <button type="button" className="h-9 w-9" aria-label="Moins" onClick={() => setQuantity(l.variantId, l.quantity - 1)}>−</button>
                    <span className="w-7 text-center tabular-nums">{l.quantity}</span>
                    <button type="button" className="h-9 w-9 disabled:opacity-30" aria-label="Plus" disabled={l.quantity >= l.available} onClick={() => setQuantity(l.variantId, l.quantity + 1)}>+</button>
                  </div>
                  <button type="button" className="text-sm text-[var(--c-muted)] underline underline-offset-4" onClick={() => setQuantity(l.variantId, 0)}>Retirer</button>
                </div>
              </div>
              <span className="font-medium tabular-nums">{m(l.priceCents * l.quantity)}</span>
            </li>
          ))}
        </ul>
        {cart?.recommendations && cart.recommendations.length > 0 && (
          <section aria-labelledby="upsell-title" className="flex flex-col gap-3">
            <h2 id="upsell-title" className="font-[family-name:var(--t-display)] text-xl font-semibold">Complétez votre commande</h2>
            <ul className="grid gap-3 sm:grid-cols-3">
              {cart.recommendations.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-[var(--t-radius)] bg-[var(--c-surface)] p-3 sm:flex-col sm:items-stretch">
                  <a href={`/s/${slug}/p/${r.handle}`} className="block w-16 shrink-0 sm:w-full"><Thumb image={r.image} hue={r.hue} title={r.title} rounded="rounded-[var(--t-radius)]" className="h-16 w-16 text-sm sm:h-28 sm:w-full" /></a>
                  <div className="min-w-0 flex-1 text-sm">
                    <a href={`/s/${slug}/p/${r.handle}`} className="line-clamp-2 font-medium hover:underline">{r.title}</a>
                    <div className="tabular-nums text-[var(--c-muted)]">{r.maxPriceCents > r.priceCents ? "Dès " : ""}{m(r.priceCents)}</div>
                  </div>
                  {r.quickVariantId
                    ? <button type="button" onClick={() => add(r.quickVariantId!, 1)} className="shrink-0 rounded-[var(--t-radius)] border border-[var(--c-text)] px-3 py-1.5 text-sm font-semibold sm:w-full">Ajouter</button>
                    : <a href={`/s/${slug}/p/${r.handle}`} className="shrink-0 rounded-[var(--t-radius)] border border-[var(--c-text)] px-3 py-1.5 text-center text-sm font-semibold sm:w-full">Choisir</a>}
                </li>
              ))}
            </ul>
          </section>
        )}
        </div>

        <div className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          <div className="flex flex-col gap-3 rounded-[var(--t-radius)] bg-[var(--c-surface)] p-5">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(code.trim().toUpperCase()); }}>
              <input id="discount" aria-label="Code promo" className={`${field} uppercase`} placeholder="Code promo" value={code} onChange={(e) => setCode(e.target.value)} />
              <button className="rounded-[var(--t-radius)] border border-[var(--c-text)] px-4 text-sm font-semibold">Appliquer</button>
            </form>
            {applied && cart?.discountError && <p className="text-sm text-red-600">{cart.discountError}</p>}
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setGift(giftInput.trim()); }}>
              <input id="gift-card" aria-label="Carte cadeau" className={`${field} uppercase`} placeholder="Carte cadeau" value={giftInput} onChange={(e) => setGiftInput(e.target.value)} />
              <button className="rounded-[var(--t-radius)] border border-[var(--c-text)] px-4 text-sm font-semibold">Utiliser</button>
            </form>
            {gift && cart?.giftCardError && <p className="text-sm text-red-600">{cart.giftCardError}</p>}
            {cart && (
              <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm tabular-nums">
                <dt className="text-[var(--c-muted)]">Sous-total</dt><dd className="text-right">{m(cart.subtotalCents)}</dd>
                {cart.discountCents > 0 && <><dt className="text-[var(--c-muted)]">Code {cart.discountCode} <button type="button" className="underline" onClick={() => { setApplied(""); setCode(""); }}>retirer</button></dt><dd className="text-right">−{m(cart.discountCents)}</dd></>}
                <dt className="text-[var(--c-muted)]">{cart.shippingMethod || "Livraison"}</dt><dd className="text-right">{cart.shippingError ? "—" : cart.shippingCents ? m(cart.shippingCents) : "Offerte"}</dd>
                {cart.taxRateBps > 0 && <><dt className="text-xs text-[var(--c-muted)]">dont TVA {(cart.taxRateBps / 100).toLocaleString("fr-FR")} %</dt><dd className="text-right text-xs text-[var(--c-muted)]">{m(cart.taxCents)}</dd></>}
                {cart.giftCardCents > 0 && <><dt className="text-[var(--c-muted)]">Carte cadeau ····{cart.giftCardCode?.slice(-4)} <button type="button" className="underline" onClick={() => { setGift(""); setGiftInput(""); }}>retirer</button><span className="block text-xs">Solde restant après achat : {m(cart.giftCardBalanceCents - cart.giftCardCents)}</span></dt><dd className="text-right">−{m(cart.giftCardCents)}</dd></>}
                <dt className="mt-2 border-t border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] pt-2 text-base font-semibold">Total</dt>
                <dd className="mt-2 border-t border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] pt-2 text-right text-base font-semibold">{m(cart.totalCents)}</dd>
              </dl>
            )}
            {cart && loyalty && cart.lines.length > 0 && <p className="text-xs text-[var(--c-muted)]">Cette commande vous rapporte <b>{Math.floor(((cart.totalCents + cart.giftCardCents - cart.shippingCents - cart.lines.filter((l) => l.isGiftCard).reduce((s, l) => s + l.priceCents * l.quantity, 0)) / 100) * loyalty.perUnit)} points</b> de fidélité, à retrouver dans « Mon compte ».</p>}
            {cart && shown && <p className="text-xs text-[var(--c-muted)]">Prix indicatifs en {shown.code}. Le paiement est effectué en {currency} : <b className="tabular-nums">{formatMoney(cart.totalCents, currency)}</b>.</p>}
            {cart && !cart.countries && cart.shippingCents > 0 && cart.freeShippingFromCents > 0 && (
              <p className="text-xs text-[var(--c-muted)]">Plus que {m(cart.freeShippingFromCents - (cart.subtotalCents - cart.discountCents))} pour la livraison offerte.</p>
            )}
          </div>

          <form onSubmit={checkout} className="flex flex-col gap-3">
            <h2 className="font-[family-name:var(--t-display)] text-xl font-semibold">{cart?.pickup ? "Réception" : "Livraison"}</h2>
            <input id="co-email" name="email" type="email" required autoComplete="email" placeholder="E-mail" aria-label="E-mail" defaultValue={recovered?.email ?? customer?.email} onBlur={(e) => saveCheckout(e.currentTarget.form)} className={field} />
            <input id="co-name" name="name" required autoComplete="name" placeholder="Nom complet" aria-label="Nom complet" defaultValue={recovered?.name ?? customer?.name} onBlur={(e) => saveCheckout(e.currentTarget.form)} className={field} />
            {cart?.pickup && (
              <fieldset className="grid grid-cols-2 gap-2">
                <legend className="sr-only">Mode de réception</legend>
                {([["ship", "Livraison"], ["pickup", "Retrait en boutique"]] as const).map(([k, label]) => {
                  const on = (cart.shippingRateId === "pickup") === (k === "pickup");
                  return (
                    <label key={k} className={`flex cursor-pointer items-center justify-center gap-2 rounded-[var(--t-radius)] border px-3 py-2.5 text-sm font-semibold ${on ? "border-[var(--c-text)] bg-[var(--c-surface)]" : "border-[color-mix(in_srgb,var(--c-text)_22%,transparent)]"}`}>
                      <input type="radio" name="delivery" checked={on} onChange={() => setRateId(k === "pickup" ? "pickup" : null)} className="sr-only" />
                      {label}
                    </label>
                  );
                })}
              </fieldset>
            )}
            {cart?.shippingRateId === "pickup" && cart.pickup ? (
              <div className="rounded-[var(--t-radius)] bg-[var(--c-surface)] p-4 text-sm">
                <p className="font-semibold">À retirer à</p>
                <p className="whitespace-pre-line">{cart.pickup.address}</p>
                {cart.pickup.instructions && <p className="mt-2 whitespace-pre-line text-[var(--c-muted)]">{cart.pickup.instructions}</p>}
                <p className="mt-2 text-[var(--c-muted)]">Nous vous écrivons dès que votre commande est prête.</p>
              </div>
            ) : (!cart || cart.lines.some((l) => !l.isGiftCard)) ? (
              <>
            <input id="co-line1" name="line1" required autoComplete="street-address" placeholder="Adresse" aria-label="Adresse" className={field} />
            <div className="grid grid-cols-[1fr_1.6fr] gap-3">
              <input id="co-zip" name="zip" required autoComplete="postal-code" placeholder="Code postal" aria-label="Code postal" className={field} />
              <input id="co-city" name="city" required autoComplete="address-level2" placeholder="Ville" aria-label="Ville" className={field} />
            </div>
            {cart?.countries ? (
              <select id="co-country" aria-label="Pays" value={country} onChange={(e) => { setCountry(e.target.value); setRateId(null); }} className={field}>
                {!cart.countries.includes(country) && <option value={country}>{country} (non livré)</option>}
                {cart.countries.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <input id="co-country" required autoComplete="country-name" value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Pays" className={field} />
            )}
            {cart && cart.shippingOptions.filter((o) => o.id !== "pickup").length > 1 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-semibold">Mode de livraison</legend>
                {cart.shippingOptions.filter((o) => o.id !== "pickup").map((o) => (
                  <label key={o.id} className={`flex cursor-pointer items-center gap-3 rounded-[var(--t-radius)] border px-3 py-2.5 ${cart.shippingRateId === o.id ? "border-[var(--c-text)]" : "border-[color-mix(in_srgb,var(--c-text)_22%,transparent)]"}`}>
                    <input type="radio" name="rate" checked={cart.shippingRateId === o.id} onChange={() => setRateId(o.id)} />
                    <span className="flex-1">{o.name}</span>
                    <span className="tabular-nums">{o.priceCents ? m(o.priceCents) : "Gratuit"}</span>
                  </label>
                ))}
              </fieldset>
            )}
              </>
            ) : (
              <p className="text-sm text-[var(--c-muted)]">Votre carte cadeau sera envoyée par e-mail à cette adresse, juste après le paiement.</p>
            )}
            {cart?.shippingError && <p className="text-sm text-red-600">{cart.shippingError}</p>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />Recevoir les nouveautés et offres par e-mail</label>
            <textarea id="co-note" name="note" maxLength={500} placeholder="Note pour la boutique (optionnel)" aria-label="Note" className={`${field} min-h-[70px]`} />
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button disabled={busy || !cart?.lines.length || Boolean(cart?.shippingError)} className="h-12 rounded-[var(--t-radius)] bg-[var(--c-accent)] font-semibold text-[var(--c-accent-text)] transition hover:opacity-90 disabled:opacity-40">
              {busy ? "Un instant…" : demo ? `Valider la commande · ${cart ? formatMoney(cart.totalCents, currency) : ""}` : `Payer ${cart ? formatMoney(cart.totalCents, currency) : ""}`}
            </button>
            <p className="text-center text-xs text-[var(--c-muted)]">{demo ? "Boutique en démonstration : aucun paiement ne sera demandé." : "Paiement sécurisé par Stripe : carte, Apple Pay, Google Pay."}</p>
          </form>
        </div>
      </div>
    </div>
  );
}
