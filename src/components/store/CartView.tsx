"use client";

import { useCallback, useEffect, useState } from "react";
import { Thumb } from "@/components/ui";
import { dict, intlLocale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { countryLabel } from "@/lib/countries";
import { presentmentTotal } from "@/lib/presentment";
import type { PricedCart } from "@/lib/pricing";
import { deliveryWindow, type CheckoutSettings } from "@/lib/checkout-settings";
import type { Suggestion } from "@/lib/recommendations";
import { useCart } from "./cart";
import { useLocale } from "./locale";

const T = dict(
  {
    orderFailed: "La commande n'a pas pu être créée. Réessayez.",
    empty: "Votre panier est vide",
    browse: "Découvrir les produits",
    cart: "Panier",
    checkoutTitle: "Paiement",
    editCart: "Modifier le panier",
    restored: "Votre panier a été retrouvé. Il ne reste plus qu'à valider la commande.",
    cancelled: "Le paiement a été interrompu. Votre panier est toujours là.",
    loading: "Chargement du panier…",
    subscription: (weekly: boolean) => `Abonnement · livré ${weekly ? "toutes les semaines" : "tous les mois"}`,
    less: "Moins",
    more: "Plus",
    remove: "Retirer",
    upsell: "Complétez votre commande",
    from: "Dès ",
    add: "Ajouter",
    choose: "Choisir",
    discount: "Code promo",
    apply: "Appliquer",
    giftCard: "Carte cadeau",
    storeCredit: "Crédit en magasin",
    taxExempt: "Prix hors taxes : votre compte est exonéré de TVA.",
    useGift: "Utiliser",
    priceList: (name: string) => `Vos prix professionnels sont appliqués (${name}).`,
    reverseCharge: "Prix hors taxes : livraison intracommunautaire à un professionnel, TVA autoliquidée par vos soins.",
    subtotal: "Sous-total",
    code: (c: string) => `Code ${c}`,
    removeLower: "retirer",
    shipping: "Livraison",
    freeShipping: "Offerte",
    vat: (rate: string) => `dont TVA ${rate} %`,
    giftBalance: "Solde restant après achat : ",
    total: "Total",
    loyaltyBefore: "Cette commande vous rapporte ",
    loyaltyPoints: (n: number) => `${n} points`,
    loyaltyAfter: " de fidélité, à retrouver dans « Mon compte ».",
    indicative: (code: string, currency: string) => `Prix indicatifs en ${code}. Le paiement est effectué en ${currency} : `,
    chargedIn: (code: string) => `Vous payez en ${code}.`,
    freeShippingLeft: (amount: string) => `Plus que ${amount} pour la livraison offerte.`,
    pickupTitle: "Réception",
    email: "E-mail",
    name: "Nom complet",
    deliveryMode: "Mode de réception",
    pickup: "Retrait en boutique",
    pickupAt: "À retirer à",
    pickupReady: "Nous vous écrivons dès que votre commande est prête.",
    address: "Adresse",
    zip: "Code postal",
    city: "Ville",
    country: "Pays",
    notShipped: "(non livré)",
    shippingMethod: "Mode de livraison",
    free: "Gratuit",
    giftByEmail: "Votre carte cadeau sera envoyée par e-mail à cette adresse, juste après le paiement.",
    marketing: "Recevoir les nouveautés et offres par e-mail",
    notePlaceholder: "Note pour la boutique (optionnel)",
    note: "Note",
    payment: "Paiement",
    payNow: "Payer maintenant",
    payLater: (days: number) => `Paiement à ${days} jours (sur facture)`,
    wait: "Un instant…",
    orderTerms: (days: number) => `Commander · à payer sous ${days} jours`,
    placeOrder: (total: string) => `Valider la commande · ${total}`,
    pay: (total: string) => `Payer ${total}`,
    demo: "Boutique en démonstration : aucun paiement ne sera demandé.",
    secure: "Paiement sécurisé par Stripe : carte, Apple Pay, Google Pay.",
    company: "Nom de l'entreprise",
    line2: "Complément d'adresse (appartement, bâtiment…)",
    phone: "Numéro de téléphone",
    optional: " (optionnel)",
    payCard: "Payer maintenant par carte",
    manualNote: "Vous recevrez les consignes de paiement juste après la validation de votre commande.",
    delivery: (from: string, to: string) => `Livraison estimée entre le ${from} et le ${to}.`,
  },
  {
    orderFailed: "Your order could not be created. Please try again.",
    empty: "Your cart is empty",
    browse: "Browse products",
    cart: "Cart",
    restored: "We've restored your cart. All that's left is to complete your order.",
    cancelled: "Payment was interrupted. Your cart is still here.",
    loading: "Loading cart…",
    checkoutTitle: "Checkout",
    editCart: "Edit cart",
    subscription: (weekly: boolean) => `Subscription · delivered ${weekly ? "every week" : "every month"}`,
    less: "Decrease quantity",
    more: "Increase quantity",
    remove: "Remove",
    upsell: "Complete your order",
    from: "From ",
    add: "Add",
    choose: "Choose",
    discount: "Discount code",
    apply: "Apply",
    giftCard: "Gift card",
    storeCredit: "Store credit",
    taxExempt: "Prices exclude VAT: your account is tax-exempt.",
    useGift: "Apply",
    priceList: (name: string) => `Your trade prices have been applied (${name}).`,
    reverseCharge: "Prices exclude VAT: intra-EU supply to a business, VAT is reverse-charged to you.",
    subtotal: "Subtotal",
    code: (c: string) => `Code ${c}`,
    removeLower: "remove",
    shipping: "Shipping",
    freeShipping: "Free",
    vat: (rate: string) => `incl. VAT ${rate}%`,
    giftBalance: "Remaining balance after purchase: ",
    total: "Total",
    loyaltyBefore: "This order earns you ",
    loyaltyPoints: (n: number) => `${n} loyalty points`,
    loyaltyAfter: ", which you'll find in “My account”.",
    indicative: (code: string, currency: string) => `Prices in ${code} are approximate. Payment is made in ${currency}: `,
    chargedIn: (code: string) => `You pay in ${code}.`,
    freeShippingLeft: (amount: string) => `Spend ${amount} more for free shipping.`,
    pickupTitle: "Delivery",
    email: "Email",
    name: "Full name",
    deliveryMode: "Delivery method",
    pickup: "In-store pickup",
    pickupAt: "Pick up at",
    pickupReady: "We'll email you as soon as your order is ready.",
    address: "Address",
    zip: "Postcode",
    city: "City",
    country: "Country",
    notShipped: "(not shipped)",
    shippingMethod: "Shipping method",
    free: "Free",
    giftByEmail: "Your gift card will be emailed to this address right after payment.",
    marketing: "Email me with news and offers",
    notePlaceholder: "Note for the shop (optional)",
    note: "Note",
    payment: "Payment",
    payNow: "Pay now",
    payLater: (days: number) => `Pay within ${days} days (on invoice)`,
    wait: "One moment…",
    orderTerms: (days: number) => `Place order · pay within ${days} days`,
    placeOrder: (total: string) => `Place order · ${total}`,
    pay: (total: string) => `Pay ${total}`,
    demo: "Demo shop: no payment will be taken.",
    secure: "Secure payment by Stripe: card, Apple Pay, Google Pay.",
    company: "Company name",
    line2: "Address line 2 (apartment, building…)",
    phone: "Phone number",
    optional: " (optional)",
    payCard: "Pay now by card",
    manualNote: "You'll receive the payment instructions right after placing your order.",
    delivery: (from: string, to: string) => `Estimated delivery between ${from} and ${to}.`,
  },
);

const field = "w-full rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] bg-[var(--c-surface)] px-3 py-2.5 outline-none focus:border-[var(--c-text)]";

type Recovered = { items: { variantId: string; quantity: number }[]; email: string; name: string; token: string } | null;

export function CartView({ slug, currency, display, chargeDisplay = false, loyalty, cancelled, demo, recovered, customer, checkout: co, checkoutOnly = false }: { slug: string; currency: string; display?: { code: string; rate: number }; chargeDisplay?: boolean; loyalty?: { perUnit: number } | null; cancelled: boolean; demo: boolean; recovered: Recovered; customer?: { email: string; name: string } | null; checkout?: CheckoutSettings; /** Depuis le panier d'un thème Shopify : récapitulatif sans modification, directement l'étape de paiement. */ checkoutOnly?: boolean }) {
  const { items, ready, setQuantity, replace, add } = useCart(slug);
  const locale = useLocale();
  const t = T[locale];
  const loc = intlLocale(locale);
  const [cart, setCart] = useState<(PricedCart & { recommendations?: Suggestion[]; paymentTermsDays?: number }) | null>(null);
  const [payLater, setPayLater] = useState(false);
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [country, setCountry] = useState("France");
  const [rateId, setRateId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [giftInput, setGiftInput] = useState("");
  const [gift, setGift] = useState("");
  const [marketing, setMarketing] = useState(co?.marketingPreselect ?? false);
  // Moyen de paiement manuel choisi (index dans Paramètres › Paiements), null = carte.
  const [manual, setManual] = useState<number | null>(null);
  const manualMethods = co?.manual ?? [];
  const eta = co ? deliveryWindow(co) : null;
  const fmtDay = (d: Date) => d.toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long" });

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
  const m = (c: number) => (shown ? formatMoney(Math.round(c * shown.rate), shown.code, loc) : formatMoney(c, currency, loc));
  // Paiement dans la devise du client (pas pour un abonnement, prélevé dans la devise de la boutique) : total exact prélevé par Stripe.
  const charged = Boolean(shown && chargeDisplay && cart && !cart.lines.some((l) => l.subscription));
  const toPay = (c: PricedCart) => (charged && shown ? formatMoney(presentmentTotal(c, shown.rate), shown.code, loc) : formatMoney(c.totalCents, currency, loc));

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
    const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, country, rateId: cart?.shippingRateId ?? rateId, giftCode: gift, marketing, slug, items, code: applied, terms: payLater && Boolean(cart?.paymentTermsDays), manual: payLater ? null : manual }) });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.url) { window.location.href = json.url; return; }
    setError(json.error ?? t.orderFailed);
    if (json.refresh) refresh();
    setBusy(false);
  }

  if (cart && !cart.lines.length && !items.length) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center">
        <h1 className="font-[family-name:var(--t-display)] text-3xl font-semibold">{t.empty}</h1>
        {cart.notices.map((n) => <p key={n} className="text-sm text-[var(--c-muted)]">{n}</p>)}
        <a href={`/s/${slug}/products`} className="rounded-[var(--t-radius)] bg-[var(--c-accent)] px-6 py-3 font-semibold text-[var(--c-accent-text)]">{t.browse}</a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-6 font-[family-name:var(--t-display)] text-3xl font-semibold md:text-4xl">{checkoutOnly ? t.checkoutTitle : t.cart}</h1>
      {restored && <p className="mb-4 rounded-[var(--t-radius)] bg-[var(--c-surface)] px-4 py-3 text-sm">{t.restored}</p>}
      {cancelled && <p className="mb-4 rounded-[var(--t-radius)] bg-[var(--c-surface)] px-4 py-3 text-sm">{t.cancelled}</p>}
      {cart?.notices.map((n) => <p key={n} className="mb-3 rounded-[var(--t-radius)] bg-[var(--c-surface)] px-4 py-3 text-sm">{n}</p>)}

      <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex min-w-0 flex-col gap-10">
        <ul className="flex flex-col divide-y divide-[color-mix(in_srgb,var(--c-text)_12%,transparent)]">
          {!cart && <li className="py-6 text-[var(--c-muted)]">{t.loading}</li>}
          {cart?.lines.map((l) => (
            <li key={l.variantId} className="flex gap-4 py-5">
              <a href={`/s/${slug}/p/${l.productHandle}`}><Thumb image={l.image} hue={l.hue} title={l.productTitle} rounded="rounded-[var(--t-radius)]" className="h-24 w-20 text-lg" /></a>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <a href={`/s/${slug}/p/${l.productHandle}`} className="font-medium">{l.productTitle}</a>
                {l.variantTitle !== "Par défaut" && <span className="text-sm text-[var(--c-muted)]">{l.variantTitle}</span>}
                {l.subscription && <span className="text-sm font-medium">{t.subscription(l.subscription === "week")}</span>}
                <span className="text-sm">{cart.priceListName && l.compareAtCents && l.compareAtCents > l.priceCents && <s className="mr-1.5 text-[var(--c-muted)]">{m(l.compareAtCents)}</s>}{m(l.priceCents)}</span>
                {checkoutOnly ? <span className="mt-auto text-sm text-[var(--c-muted)]">× {l.quantity}</span> : <div className="mt-auto flex items-center gap-3">
                  <div className="inline-flex items-center rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)]">
                    <button type="button" className="h-9 w-9" aria-label={t.less} onClick={() => setQuantity(l.variantId, l.quantity - 1)}>−</button>
                    <span className="w-7 text-center tabular-nums">{l.quantity}</span>
                    <button type="button" className="h-9 w-9 disabled:opacity-30" aria-label={t.more} disabled={l.quantity >= l.available} onClick={() => setQuantity(l.variantId, l.quantity + 1)}>+</button>
                  </div>
                  <button type="button" className="text-sm text-[var(--c-muted)] underline underline-offset-4" onClick={() => setQuantity(l.variantId, 0)}>{t.remove}</button>
                </div>}
              </div>
              <span className="font-medium tabular-nums">{shown ? formatMoney(Math.round(l.priceCents * shown.rate) * l.quantity, shown.code, loc) : m(l.priceCents * l.quantity)}</span>
            </li>
          ))}
        </ul>
        {checkoutOnly && <a href={`/s/${slug}/cart`} className="self-start text-sm underline underline-offset-4">{t.editCart}</a>}
        {!checkoutOnly && cart?.recommendations && cart.recommendations.length > 0 && (
          <section aria-labelledby="upsell-title" className="flex flex-col gap-3">
            <h2 id="upsell-title" className="font-[family-name:var(--t-display)] text-xl font-semibold">{t.upsell}</h2>
            <ul className="grid gap-3 sm:grid-cols-3">
              {cart.recommendations.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-[var(--t-radius)] bg-[var(--c-surface)] p-3 sm:flex-col sm:items-stretch">
                  <a href={`/s/${slug}/p/${r.handle}`} className="block w-16 shrink-0 sm:w-full"><Thumb image={r.image} hue={r.hue} title={r.title} rounded="rounded-[var(--t-radius)]" className="h-16 w-16 text-sm sm:h-28 sm:w-full" /></a>
                  <div className="min-w-0 flex-1 text-sm">
                    <a href={`/s/${slug}/p/${r.handle}`} className="line-clamp-2 font-medium hover:underline">{r.title}</a>
                    <div className="tabular-nums text-[var(--c-muted)]">{r.maxPriceCents > r.priceCents ? t.from : ""}{m(r.priceCents)}</div>
                  </div>
                  {r.quickVariantId
                    ? <button type="button" onClick={() => add(r.quickVariantId!, 1)} className="shrink-0 rounded-[var(--t-radius)] border border-[var(--c-text)] px-3 py-1.5 text-sm font-semibold sm:w-full">{t.add}</button>
                    : <a href={`/s/${slug}/p/${r.handle}`} className="shrink-0 rounded-[var(--t-radius)] border border-[var(--c-text)] px-3 py-1.5 text-center text-sm font-semibold sm:w-full">{t.choose}</a>}
                </li>
              ))}
            </ul>
          </section>
        )}
        </div>

        <div className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          <div className="flex flex-col gap-3 rounded-[var(--t-radius)] bg-[var(--c-surface)] p-5">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(code.trim().toUpperCase()); }}>
              <input id="discount" aria-label={t.discount} className={`${field} uppercase`} placeholder={t.discount} value={code} onChange={(e) => setCode(e.target.value)} />
              <button className="rounded-[var(--t-radius)] border border-[var(--c-text)] px-4 text-sm font-semibold">{t.apply}</button>
            </form>
            {applied && cart?.discountError && <p className="text-sm text-red-600">{cart.discountError}</p>}
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setGift(giftInput.trim()); }}>
              <input id="gift-card" aria-label={t.giftCard} className={`${field} uppercase`} placeholder={t.giftCard} value={giftInput} onChange={(e) => setGiftInput(e.target.value)} />
              <button className="rounded-[var(--t-radius)] border border-[var(--c-text)] px-4 text-sm font-semibold">{t.useGift}</button>
            </form>
            {gift && cart?.giftCardError && <p className="text-sm text-red-600">{cart.giftCardError}</p>}
            {cart?.priceListName && <p className="text-sm font-medium">{t.priceList(cart.priceListName)}</p>}
            {cart?.reverseCharge && <p className="text-sm font-medium">{t.reverseCharge}</p>}
            {cart?.taxExempt && <p className="text-sm font-medium">{t.taxExempt}</p>}
            {cart && (
              <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm tabular-nums">
                <dt className="text-[var(--c-muted)]">{t.subtotal}</dt><dd className="text-right">{m(cart.subtotalCents)}</dd>
                {cart.discountCents > 0 && <><dt className="text-[var(--c-muted)]">{t.code(cart.discountCode ?? "")} <button type="button" className="underline" onClick={() => { setApplied(""); setCode(""); }}>{t.removeLower}</button></dt><dd className="text-right">−{m(cart.discountCents)}</dd></>}
                <dt className="text-[var(--c-muted)]">{cart.shippingMethod || t.shipping}</dt><dd className="text-right">{cart.shippingError ? "—" : cart.shippingCents ? m(cart.shippingCents) : t.freeShipping}</dd>
                {cart.taxRateBps > 0 && <><dt className="text-xs text-[var(--c-muted)]">{t.vat((cart.taxRateBps / 100).toLocaleString(loc))}</dt><dd className="text-right text-xs text-[var(--c-muted)]">{m(cart.taxCents)}</dd></>}
                {(cart.storeCreditCents ?? 0) > 0 && <><dt className="text-[var(--c-muted)]">{t.storeCredit}</dt><dd className="text-right">−{m(cart.storeCreditCents!)}</dd></>}
                {cart.giftCardCents > 0 && <><dt className="text-[var(--c-muted)]">{t.giftCard} ····{cart.giftCardCode?.slice(-4)} <button type="button" className="underline" onClick={() => { setGift(""); setGiftInput(""); }}>{t.removeLower}</button><span className="block text-xs">{t.giftBalance}{m(cart.giftCardBalanceCents - cart.giftCardCents)}</span></dt><dd className="text-right">−{m(cart.giftCardCents)}</dd></>}
                <dt className="mt-2 border-t border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] pt-2 text-base font-semibold">{t.total}</dt>
                <dd className="mt-2 border-t border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] pt-2 text-right text-base font-semibold">{charged ? toPay(cart) : m(cart.totalCents)}</dd>
              </dl>
            )}
            {cart && loyalty && cart.lines.length > 0 && <p className="text-xs text-[var(--c-muted)]">{t.loyaltyBefore}<b>{t.loyaltyPoints(Math.floor(((cart.totalCents + cart.giftCardCents - cart.shippingCents - cart.lines.filter((l) => l.isGiftCard).reduce((s, l) => s + l.priceCents * l.quantity, 0)) / 100) * loyalty.perUnit))}</b>{t.loyaltyAfter}</p>}
            {cart && shown && charged && <p className="text-xs text-[var(--c-muted)]">{t.chargedIn(shown.code)}</p>}
            {cart && shown && !charged && <p className="text-xs text-[var(--c-muted)]">{t.indicative(shown.code, currency)}<b className="tabular-nums">{formatMoney(cart.totalCents, currency, loc)}</b>.</p>}
            {cart && !cart.countries && cart.shippingCents > 0 && cart.freeShippingFromCents > 0 && (
              <p className="text-xs text-[var(--c-muted)]">{t.freeShippingLeft(m(cart.freeShippingFromCents - (cart.subtotalCents - cart.discountCents)))}</p>
            )}
          </div>

          <form onSubmit={checkout} className="flex flex-col gap-3">
            <h2 className="font-[family-name:var(--t-display)] text-xl font-semibold">{cart?.pickup ? t.pickupTitle : t.shipping}</h2>
            <input id="co-email" name="email" type="email" required autoComplete="email" placeholder={t.email} aria-label={t.email} defaultValue={recovered?.email ?? customer?.email} onBlur={(e) => saveCheckout(e.currentTarget.form)} className={field} />
            <input id="co-name" name="name" required autoComplete="name" placeholder={t.name} aria-label={t.name} defaultValue={recovered?.name ?? customer?.name} onBlur={(e) => saveCheckout(e.currentTarget.form)} className={field} />
            {co && co.company !== "hidden" && <input id="co-company" name="company" required={co.company === "required"} autoComplete="organization" maxLength={120} placeholder={`${t.company}${co.company === "optional" ? t.optional : ""}`} aria-label={t.company} className={field} />}
            {co && co.phone !== "hidden" && <input id="co-phone" name="phone" type="tel" required={co.phone === "required"} autoComplete="tel" maxLength={30} placeholder={`${t.phone}${co.phone === "optional" ? t.optional : ""}`} aria-label={t.phone} className={field} />}
            {cart?.pickup && (
              <fieldset className="grid grid-cols-2 gap-2">
                <legend className="sr-only">{t.deliveryMode}</legend>
                {([["ship", t.shipping], ["pickup", t.pickup]] as const).map(([k, label]) => {
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
                <p className="font-semibold">{t.pickupAt}</p>
                <p className="whitespace-pre-line">{cart.pickup.address}</p>
                {cart.pickup.instructions && <p className="mt-2 whitespace-pre-line text-[var(--c-muted)]">{cart.pickup.instructions}</p>}
                <p className="mt-2 text-[var(--c-muted)]">{t.pickupReady}</p>
              </div>
            ) : (!cart || cart.lines.some((l) => !l.isGiftCard)) ? (
              <>
            <input id="co-line1" name="line1" required autoComplete="street-address" placeholder={t.address} aria-label={t.address} className={field} />
            {(!co || co.address2) && <input id="co-line2" name="line2" autoComplete="address-line2" maxLength={140} placeholder={t.line2} aria-label={t.line2} className={field} />}
            <div className="grid grid-cols-[1fr_1.6fr] gap-3">
              <input id="co-zip" name="zip" required autoComplete="postal-code" placeholder={t.zip} aria-label={t.zip} className={field} />
              <input id="co-city" name="city" required autoComplete="address-level2" placeholder={t.city} aria-label={t.city} className={field} />
            </div>
            {cart?.countries ? (
              <select id="co-country" aria-label={t.country} value={country} onChange={(e) => { setCountry(e.target.value); setRateId(null); }} className={field}>
                {!cart.countries.includes(country) && <option value={country}>{countryLabel(country, locale)} {t.notShipped}</option>}
                {cart.countries.map((c) => <option key={c} value={c}>{countryLabel(c, locale)}</option>)}
              </select>
            ) : (
              <input id="co-country" required autoComplete="country-name" value={country} onChange={(e) => setCountry(e.target.value)} aria-label={t.country} className={field} />
            )}
            {cart && cart.shippingOptions.filter((o) => o.id !== "pickup").length > 1 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-semibold">{t.shippingMethod}</legend>
                {cart.shippingOptions.filter((o) => o.id !== "pickup").map((o) => (
                  <label key={o.id} className={`flex cursor-pointer items-center gap-3 rounded-[var(--t-radius)] border px-3 py-2.5 ${cart.shippingRateId === o.id ? "border-[var(--c-text)]" : "border-[color-mix(in_srgb,var(--c-text)_22%,transparent)]"}`}>
                    <input type="radio" name="rate" checked={cart.shippingRateId === o.id} onChange={() => setRateId(o.id)} />
                    <span className="flex-1">{o.name}</span>
                    <span className="tabular-nums">{o.priceCents ? m(o.priceCents) : t.free}</span>
                  </label>
                ))}
              </fieldset>
            )}
              </>
            ) : (
              <p className="text-sm text-[var(--c-muted)]">{t.giftByEmail}</p>
            )}
            {cart?.shippingError && <p className="text-sm text-red-600">{cart.shippingError}</p>}
            {eta && cart && cart.shippingRateId !== "pickup" && cart.lines.some((l) => !l.isGiftCard) && <p className="text-sm text-[var(--c-muted)]">{t.delivery(fmtDay(eta.from), fmtDay(eta.to))}</p>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />{t.marketing}</label>
            <textarea id="co-note" name="note" maxLength={500} placeholder={t.notePlaceholder} aria-label={t.note} className={`${field} min-h-[70px]`} />
            {cart && cart.totalCents > 0 && (cart.paymentTermsDays || manualMethods.length > 0) ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-semibold">{t.payment}</legend>
                {([
                  { id: "card", label: manualMethods.length ? t.payCard : t.payNow, on: !payLater && manual === null, pick: () => { setPayLater(false); setManual(null); } },
                  ...manualMethods.map((m) => ({ id: `manual-${m.index}`, label: m.name, on: !payLater && manual === m.index, pick: () => { setPayLater(false); setManual(m.index); } })),
                  ...(cart.paymentTermsDays ? [{ id: "terms", label: t.payLater(cart.paymentTermsDays), on: payLater, pick: () => { setPayLater(true); setManual(null); } }] : []),
                ]).map((o) => (
                  <label key={o.id} className={`flex cursor-pointer items-center gap-3 rounded-[var(--t-radius)] border px-3 py-2.5 ${o.on ? "border-[var(--c-text)]" : "border-[color-mix(in_srgb,var(--c-text)_22%,transparent)]"}`}>
                    <input type="radio" name="payment" checked={o.on} onChange={o.pick} />
                    <span className="flex-1">{o.label}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button disabled={busy || !cart?.lines.length || Boolean(cart?.shippingError)} className="h-12 rounded-[var(--t-radius)] bg-[var(--c-accent)] font-semibold text-[var(--c-accent-text)] transition hover:opacity-90 disabled:opacity-40">
              {busy ? t.wait : payLater && cart?.paymentTermsDays ? t.orderTerms(cart.paymentTermsDays) : demo || manual !== null ? t.placeOrder(cart ? toPay(cart) : "") : t.pay(cart ? toPay(cart) : "")}
            </button>
            <p className="text-center text-xs text-[var(--c-muted)]">{manual !== null && !payLater ? t.manualNote : demo ? t.demo : t.secure}</p>
          </form>
        </div>
      </div>
    </div>
  );
}
