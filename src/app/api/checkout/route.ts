import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { confirmTermsOrder, createOrder, markOrderPaid, OrderError, type Address } from "@/lib/orders";
import { attributeOrder, SESSION_COOKIE } from "@/lib/traffic";
import { checkoutSettingsOf, manualPaymentAt } from "@/lib/checkout-settings";
import { getCustomer } from "@/lib/customer-auth";
import { currentMarket } from "@/lib/markets";
import { PICKUP_ID, priceCart } from "@/lib/pricing";
import { storeAccess } from "@/lib/store-access";
import { subscribe } from "@/lib/marketing";
import { appUrl, demoPaymentsAllowed, getStripe } from "@/lib/stripe";
import { canSell, SALES_PAUSED, storeFeePercent, storePlatformFee } from "@/lib/billing";
import { displayCurrency } from "@/lib/currency";
import { CHARGEABLE_CURRENCIES, presentmentTotal, toPresentment } from "@/lib/presentment";
import { storeBase } from "@/lib/domains";
import { dict, translate, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

/** Messages montrés au client, dans sa langue. */
const MSG = dict(
  {
    email: "Indiquez une adresse e-mail valide.",
    name: "Indiquez votre nom complet.",
    noStore: "Boutique introuvable.",
    closed: "Cette boutique n'est pas encore ouverte.",
    termsOff: "Le paiement à échéance n'est pas disponible pour ce compte.",
    address: "Indiquez votre adresse.",
    zip: "Indiquez votre code postal.",
    city: "Indiquez votre ville.",
    empty: "Votre panier est vide.",
    otherCustomer: "Ce bon est réservé à un autre client : utilisez l'adresse e-mail de votre compte.",
    alreadyUsed: "Vous avez déjà utilisé ce code promo.",
    oneSub: "Un seul produit en abonnement par commande : passez une commande séparée pour le suivant.",
    subTerms: "Les abonnements se paient à la commande : retirez-les ou choisissez le paiement immédiat.",
    tooSmall: "Le montant restant est trop faible pour un paiement par carte (50 centimes minimum).",
    paymentsOff: "Le paiement en ligne n'est pas encore activé pour cette boutique.",
    phone: "Indiquez votre numéro de téléphone.",
    company: "Indiquez le nom de votre entreprise.",
    manualOff: "Ce moyen de paiement n'est plus proposé. Rechargez la page.",
    manualSub: "Les abonnements se paient par carte : retirez-les ou choisissez le paiement par carte.",
    giftCard: "Carte cadeau",
    reduction: "Réduction",
    shipping: "Livraison",
  },
  {
    email: "Enter a valid email address.",
    name: "Enter your full name.",
    noStore: "Store not found.",
    closed: "This store isn't open yet.",
    termsOff: "Payment on terms isn't available for this account.",
    address: "Enter your address.",
    zip: "Enter your postal code.",
    city: "Enter your city.",
    empty: "Your cart is empty.",
    otherCustomer: "This code is reserved for another customer: use your account's email address.",
    alreadyUsed: "You've already used this discount code.",
    oneSub: "Only one subscription product per order: place a separate order for the next one.",
    subTerms: "Subscriptions are paid at checkout: remove them or choose to pay now.",
    tooSmall: "The remaining amount is too low for a card payment (0.50 minimum).",
    paymentsOff: "Online payment isn't enabled for this store yet.",
    phone: "Enter your phone number.",
    company: "Enter your company name.",
    manualOff: "This payment method is no longer offered. Please reload the page.",
    manualSub: "Subscriptions are paid by card: remove them or choose card payment.",
    giftCard: "Gift card",
    reduction: "Discount",
    shipping: "Shipping",
  },
);

/** Erreurs de création de commande (src/lib/orders.ts) traduites pour le client. */
const ORDER_ERRORS_EN: Record<string, string> = {
  "Le solde de la carte cadeau ne suffit plus. Rechargez votre panier.": "Your gift card balance is no longer sufficient. Please refresh your cart.",
  "Ce code promo a déjà été utilisé le nombre maximum de fois.": "This discount code has reached its usage limit.",
};
const orderError = (msg: string, locale: Locale) => (locale === "en" ? ORDER_ERRORS_EN[msg] ?? msg : msg);

const schemaFor = (t: (typeof MSG)[Locale]) => z.object({
  slug: z.string(),
  items: z.array(z.object({ variantId: z.string(), quantity: z.number() })).min(1).max(100),
  code: z.string().max(30).optional().default(""),
  email: z.string().trim().email(t.email),
  name: z.string().trim().min(2, t.name).max(80),
  line1: z.string().trim().max(140).optional().default(""),
  line2: z.string().trim().max(140).optional().default(""),
  company: z.string().trim().max(120).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
  zip: z.string().trim().max(12).optional().default(""),
  city: z.string().trim().max(60).optional().default(""),
  country: z.string().trim().max(60).optional().default(""),
  note: z.string().max(500).optional().default(""),
  rateId: z.string().max(40).optional().nullable(),
  giftCode: z.string().max(40).optional().nullable(),
  marketing: z.boolean().optional().default(false),
  /** Client professionnel : payer à échéance plutôt qu'à la commande. */
  terms: z.boolean().optional().default(false),
  /** Moyen de paiement manuel choisi (index dans Paramètres › Paiements), ou absent pour la carte. */
  manual: z.number().int().min(0).max(10).optional().nullable(),
});

/** Session de visite du client (mesure d'audience), pour attribuer la commande à sa source. */
async function sessionId() {
  try { return (await cookies()).get(SESSION_COOKIE)?.value ?? null; } catch { return null; }
}

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  // Langue du visiteur (connue dès qu'on sait de quelle boutique il s'agit), pour tous les messages.
  const found = typeof raw?.slug === "string" ? await db.store.findUnique({ where: { slug: raw.slug } }) : null;
  const locale: Locale = found ? await getLocale(found) : "fr";
  const t = MSG[locale];
  const parsed = schemaFor(t).safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const b = parsed.data;

  const store = found;
  if (!store) return NextResponse.json({ error: t.noStore }, { status: 404 });
  if (!(await storeAccess(store)).allowed) return NextResponse.json({ error: t.closed }, { status: 403 });
  // Essai terminé ou forfait impayé : la boutique reste visible mais ne prend plus de commande.
  if (!canSell(store)) return NextResponse.json({ error: SALES_PAUSED[locale] }, { status: 403 });

  const customer = await getCustomer(store.id);
  const cart = await priceCart(store, b.items, b.code, { country: b.country, rateId: b.rateId }, b.giftCode, { priceListId: customer?.priceListId, vatNumber: customer?.vatValid === false ? null : customer?.vatNumber, locale, customerId: customer?.id, customerEmail: customer?.email, taxExempt: customer?.taxExempt, storeCreditCents: store.storeCreditEnabled ? customer?.storeCreditCents : 0, priceAdjustBps: (await currentMarket(store, b.country))?.priceAdjustBps ?? 0 });
  // Paiement à échéance : réservé au client professionnel connecté, et la commande est à son nom.
  const terms = b.terms && cart.totalCents > 0;
  if (terms && !customer?.paymentTermsDays) return NextResponse.json({ error: t.termsOff }, { status: 400 });
  if (terms) b.email = customer!.email;
  if (b.giftCode && cart.giftCardError) return NextResponse.json({ error: cart.giftCardError }, { status: 400 });
  if (cart.shippingError) return NextResponse.json({ error: cart.shippingError }, { status: 400 });
  const pickup = cart.shippingRateId === PICKUP_ID;
  if (cart.lines.some((l) => !l.isGiftCard) && !pickup) {
    if (b.line1.length < 3) return NextResponse.json({ error: t.address }, { status: 400 });
    if (b.zip.length < 2) return NextResponse.json({ error: t.zip }, { status: 400 });
    if (!b.city) return NextResponse.json({ error: t.city }, { status: 400 });
  }
  // Champs du processus de paiement réglés par le marchand (Paramètres › Page de paiement).
  const co = checkoutSettingsOf(store);
  if (co.phone === "required" && b.phone.length < 6) return NextResponse.json({ error: t.phone }, { status: 400 });
  if (co.company === "required" && b.company.length < 2) return NextResponse.json({ error: t.company }, { status: 400 });
  const address: Address = { line1: b.line1, zip: b.zip, city: b.city, country: b.country, ...(co.address2 && b.line2 ? { line2: b.line2 } : {}), ...(co.company !== "hidden" && b.company ? { company: b.company } : {}), ...(co.phone !== "hidden" && b.phone ? { phone: b.phone } : {}) };
  if (!cart.lines.length) return NextResponse.json({ error: t.empty }, { status: 400 });
  if (b.code && cart.discountError) return NextResponse.json({ error: cart.discountError }, { status: 400 });
  // Code saisi par le client (le libellé affiché peut réunir plusieurs remises cumulées).
  const typed = b.code.trim().toUpperCase();
  const d = typed ? await db.discount.findUnique({ where: { storeId_code: { storeId: store.id, code: typed } } }) : null;
  if (d && (cart.discountId === d.id || cart.shippingDiscountId === d.id)) {
    if (d.customerEmail && d.customerEmail !== b.email.trim().toLowerCase()) return NextResponse.json({ error: t.otherCustomer }, { status: 400 });
    // « Une fois par client » : une commande non annulée avec ce code et cette adresse suffit à le refuser.
    if (d.oncePerCustomer && (await db.order.count({ where: { storeId: store.id, OR: [{ discountId: d.id }, { shippingDiscountId: d.id }], email: { in: [b.email.trim(), b.email.trim().toLowerCase()] }, cancelledAt: null } })) > 0)
      return NextResponse.json({ error: t.alreadyUsed }, { status: 400 });
  }
  if (cart.notices.length) return NextResponse.json({ error: cart.notices[0], refresh: true }, { status: 409 });

  const subIntervals = [...new Set(cart.lines.filter((l) => l.subscription).map((l) => l.subscription!))];
  if (subIntervals.length > 1 || cart.lines.filter((l) => l.subscription).length > 1) return NextResponse.json({ error: t.oneSub }, { status: 400 });

  if (terms) {
    if (subIntervals.length) return NextResponse.json({ error: t.subTerms }, { status: 400 });
    let order;
    try {
      order = await createOrder(store, cart, { email: b.email, name: b.name, address, note: b.note }, "terms");
    } catch (e) {
      if (e instanceof OrderError) return NextResponse.json({ error: orderError(e.message, locale), refresh: true }, { status: 409 });
      throw e;
    }
    // Langue du client : les e-mails de la commande seront envoyés dans cette langue.
    await db.order.update({ where: { id: order.id }, data: { locale, ...(pickup ? { deliveryMethod: "pickup" } : {}) } });
    await attributeOrder(store.id, order.id, await sessionId());
    if (b.marketing) await subscribe(store.id, b.email, b.name);
    await confirmTermsOrder(order.id, customer!.paymentTermsDays);
    return NextResponse.json({ url: `${storeBase(store)}/order/${order.id}` });
  }

  // Moyen de paiement manuel (virement, à la livraison…) : commande confirmée en attente de paiement, consignes au client.
  if (b.manual != null && cart.totalCents > 0) {
    const method = manualPaymentAt(store.manualPayments, b.manual);
    if (!method) return NextResponse.json({ error: t.manualOff }, { status: 400 });
    if (subIntervals.length) return NextResponse.json({ error: t.manualSub }, { status: 400 });
    let order;
    try {
      order = await createOrder(store, cart, { email: b.email, name: b.name, address, note: b.note }, "manual");
    } catch (e) {
      if (e instanceof OrderError) return NextResponse.json({ error: orderError(e.message, locale), refresh: true }, { status: 409 });
      throw e;
    }
    await db.order.update({ where: { id: order.id }, data: { locale, paymentInstructions: `${method.name}\n${method.instructions}`.trim(), ...(pickup ? { deliveryMethod: "pickup" } : {}) } });
    await attributeOrder(store.id, order.id, await sessionId());
    if (b.marketing) await subscribe(store.id, b.email, b.name);
    return NextResponse.json({ url: `${storeBase(store)}/order/${order.id}` });
  }

  const stripe = getStripe();
  const stripeReady = Boolean(stripe && store.stripeAccountId && store.stripeChargesEnabled);
  // Rien à payer (carte cadeau qui couvre tout) : pas de passage par Stripe.
  const useStripe = stripeReady && cart.totalCents > 0;
  if (useStripe && cart.totalCents < 50) return NextResponse.json({ error: t.tooSmall }, { status: 400 });
  // Sans Stripe, une vraie boutique ne doit jamais valider une commande sans paiement.
  if (cart.totalCents > 0 && !useStripe && !demoPaymentsAllowed()) return NextResponse.json({ error: t.paymentsOff }, { status: 400 });
  let order;
  try {
    order = await createOrder(
      store,
      cart,
      { email: b.email, name: b.name, address, note: b.note },
      useStripe ? "stripe" : "demo",
    );
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: orderError(e.message, locale), refresh: true }, { status: 409 });
    throw e;
  }
  // Devise du client : encaissée telle quelle si la boutique l'a choisi (pas pour un abonnement, prélevé dans la devise de la boutique).
  const shown = await displayCurrency(store);
  const isSub = subIntervals.length === 1;
  const foreign = store.chargeInCustomerCurrency && !isSub && shown.code !== store.currency && CHARGEABLE_CURRENCIES.has(shown.code) ? shown : null;
  const rate = foreign?.rate ?? 1;
  const conv = (c: number) => (foreign ? toPresentment(c, rate) : c);
  const payTotal = foreign ? presentmentTotal(cart, rate) : cart.totalCents;
  // Langue du client : les e-mails de la commande seront envoyés dans cette langue.
  await db.order.update({ where: { id: order.id }, data: { locale, ...(pickup ? { deliveryMethod: "pickup" } : {}), ...(foreign ? { presentmentCurrency: foreign.code, presentmentRate: rate, presentmentTotalCents: payTotal } : {}) } });
  await attributeOrder(store.id, order.id, await sessionId());
  if (b.marketing) await subscribe(store.id, b.email, b.name);
  const thanks = `${storeBase(store)}/order/${order.id}`;

  if (!useStripe || !stripe) {
    await markOrderPaid(order.id);
    return NextResponse.json({ url: thanks });
  }

  const currency = (foreign?.code ?? store.currency).toLowerCase();
  const reduction = conv(cart.discountCents + cart.giftCardCents);
  const coupon = reduction > 0 ? await stripe.coupons.create({ amount_off: reduction, currency, duration: "once", name: [cart.discountCode, cart.giftCardCode && t.giftCard].filter(Boolean).join(" + ") || t.reduction }) : null;
  // Abonnement : Stripe prélève ensuite le client à chaque échéance et reverse l'argent au marchand.
  // Noms des produits sur la page Stripe : dans la langue du client (les lignes de commande gardent le titre d'origine).
  const titles = new Map<string, string>();
  if (locale !== "fr") for (const p of await db.product.findMany({ where: { id: { in: [...new Set(cart.lines.map((l) => l.productId))] } }, select: { id: true, title: true, translations: true } })) titles.set(p.id, translate(p, locale, ["title"]).title);
  const session = await stripe.checkout.sessions.create({
    mode: isSub ? "subscription" : "payment",
    customer_email: b.email,
    locale: locale === "en" ? "en" : "fr",
    line_items: [
      ...cart.lines.map((l) => ({
        quantity: l.quantity,
        price_data: {
          currency,
          unit_amount: conv(l.priceCents),
          product_data: { name: l.variantTitle === "Par défaut" ? titles.get(l.productId) ?? l.productTitle : `${titles.get(l.productId) ?? l.productTitle} — ${l.variantTitle}` },
          ...(l.subscription ? { recurring: { interval: l.subscription as "week" | "month" } } : {}),
        },
      })),
      ...(cart.shippingCents ? [{ quantity: 1, price_data: { currency, unit_amount: conv(cart.shippingCents), product_data: { name: cart.shippingMethod || t.shipping } } }] : []),
    ],
    ...(coupon ? { discounts: [{ coupon: coupon.id }] } : {}),
    ...(isSub
      ? { subscription_data: { application_fee_percent: storeFeePercent(store), transfer_data: { destination: store.stripeAccountId! }, metadata: { orderId: order.id, storeId: store.id } } }
      : { payment_intent_data: { application_fee_amount: storePlatformFee(store, payTotal), transfer_data: { destination: store.stripeAccountId! }, metadata: { orderId: order.id, storeId: store.id } } }),
    metadata: { orderId: order.id, storeId: store.id },
    success_url: `${thanks}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${storeBase(store)}/cart?cancelled=1`,
  });
  await db.order.update({ where: { id: order.id }, data: { stripeSessionId: session.id } });
  return NextResponse.json({ url: session.url });
}
