import { notFound } from "next/navigation";
import { ClearCart } from "@/components/store/ClearCart";
import { TrackPurchase } from "@/components/store/Tracking";
import { Thumb } from "@/components/ui";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { orderCurrency } from "@/lib/presentment";
import { markOrderPaid } from "@/lib/orders";
import { getStore } from "@/lib/storefront";
import { localizeItems } from "@/lib/locale";
import { payLink } from "@/lib/invoices";
import { getStripe } from "@/lib/stripe";
import { carrierLabel, trackingLink } from "@/lib/tracking";
import { dict, intlLocale } from "@/lib/i18n";
import { orderNumber } from "@/lib/checkout-settings";

const T = dict(
  {
    title: "Commande confirmée",
    thanks: (name: string) => `Merci ${name} !`,
    pending: "Paiement en cours de validation",
    confirmed1: "Votre commande ",
    confirmed2: (email: string) => ` est confirmée. Gardez ce numéro : la boutique vous contactera à ${email} si besoin.`,
    waiting: "Nous attendons la confirmation de votre banque. Rechargez cette page dans quelques instants.",
    dueBy: (amount: string, date: string) => `${amount} à régler avant le ${date}`,
    terms: "Paiement à échéance : le lien de paiement vous a aussi été envoyé par e-mail.",
    payNow: "Payer maintenant",
    pickedUp: "Commande récupérée. Merci !",
    ready: "Votre commande est prête : vous pouvez venir la chercher.",
    pickup: "Retrait en boutique : nous vous écrivons dès qu'elle est prête.",
    onItsWay: "Votre commande est en route",
    carrier: "Transporteur",
    track: "Suivre mon colis",
    totalDue: "Total à payer",
    totalPaid: "Total payé",
    manualTitle: "Comment régler votre commande",
    manualNote: "Votre commande est enregistrée : elle sera expédiée dès réception de votre paiement.",
    invoice: "Télécharger la facture",
    back: "Retour à la boutique",
  },
  {
    title: "Order confirmed",
    thanks: (name: string) => `Thank you, ${name}!`,
    pending: "Payment being processed",
    confirmed1: "Your order ",
    confirmed2: (email: string) => ` is confirmed. Keep this number: the store will contact you at ${email} if needed.`,
    waiting: "We're waiting for confirmation from your bank. Reload this page in a few moments.",
    dueBy: (amount: string, date: string) => `${amount} due by ${date}`,
    terms: "Payment on terms: the payment link has also been sent to you by email.",
    payNow: "Pay now",
    pickedUp: "Order picked up. Thank you!",
    ready: "Your order is ready: you can come and collect it.",
    pickup: "In-store pickup: we'll email you as soon as it's ready.",
    onItsWay: "Your order is on its way",
    carrier: "Carrier",
    track: "Track my parcel",
    totalDue: "Total due",
    totalPaid: "Total paid",
    manualTitle: "How to pay for your order",
    manualNote: "Your order is recorded: it will ship as soon as we receive your payment.",
    invoice: "Download invoice",
    back: "Back to store",
  },
);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { locale } = await getStore((await params).slug);
  return { title: T[locale].title };
}

export default async function OrderConfirmation({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { store, locale } = await getStore(slug);
  const t = T[locale];
  let order = await db.order.findFirst({ where: { id, storeId: store.id }, include: { items: true } });
  if (!order) notFound();

  // Si le webhook n'est pas encore passé, on vérifie le paiement directement auprès de Stripe.
  if (order.paymentStatus === "pending" && order.stripeSessionId) {
    const stripe = getStripe();
    const session = stripe ? await stripe.checkout.sessions.retrieve(order.stripeSessionId) : null;
    if (session?.payment_status === "paid") {
      if (session.metadata?.invoice) await db.order.updateMany({ where: { id: order.id }, data: { paymentMethod: "stripe" } });
      await markOrderPaid(order.id);
      order = (await db.order.findUnique({ where: { id }, include: { items: true } }))!;
    }
  }
  const paid = order.paymentStatus === "paid";
  const items = await localizeItems(order.items, locale);
  // Client professionnel à échéance : la commande est confirmée, le paiement viendra avant la date limite.
  const onTerms = order.paymentStatus === "pending" && Boolean(order.dueAt) && !order.cancelledAt;
  // Paiement manuel (virement, à la livraison) : commande confirmée, le client suit les consignes données.
  const manual = order.paymentStatus === "pending" && order.paymentMethod === "manual" && !order.cancelledAt && Boolean(order.paymentInstructions);
  const confirmed = paid || onTerms || manual;
  const payUrl = onTerms && order.totalCents > 0 ? await payLink(order, slug) : null;
  // Montants dans la devise payée par le client.
  const cur = orderCurrency(order, store.currency);
  const m = (c: number) => formatMoney(cur.convert(c), cur.currency, intlLocale(locale));
  const carrier = (c: string) => (c === "other" ? t.carrier : carrierLabel(c));

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8 px-4 py-16">
      {confirmed && <ClearCart slug={slug} />}
      {confirmed && (store.gaId || store.metaPixelId) && <TrackPurchase orderId={order.id} valueCents={order.totalCents} currency={store.currency} />}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--c-accent)] text-2xl text-[var(--c-accent-text)]">{confirmed ? "✓" : "…"}</div>
        <h1 className="font-[family-name:var(--t-display)] text-3xl font-semibold">{confirmed ? t.thanks(order.name.split(" ")[0]) : t.pending}</h1>
        <p className="text-[var(--c-muted)]">
          {confirmed
            ? <>{t.confirmed1}<b className="tabular-nums">{orderNumber(store, order.number)}</b>{t.confirmed2(order.email)}</>
            : t.waiting}
        </p>
      </div>
      {onTerms && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--t-radius)] border border-[var(--c-accent)] p-4">
          <span>
            <span className="font-semibold tabular-nums">{t.dueBy(m(order.totalCents), order.dueAt!.toLocaleDateString(intlLocale(locale), { day: "numeric", month: "long", year: "numeric" }))}</span>
            <span className="block text-sm text-[var(--c-muted)]">{t.terms}</span>
          </span>
          {payUrl && <a href={payUrl} className="rounded-[var(--t-radius)] bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-accent-text)]">{t.payNow}</a>}
        </div>
      )}
      {manual && (
        <div className="rounded-[var(--t-radius)] border border-[var(--c-accent)] p-4">
          <p className="font-semibold">{t.manualTitle}</p>
          <p className="mt-1 whitespace-pre-line text-sm">{order.paymentInstructions}</p>
          <p className="mt-2 text-sm text-[var(--c-muted)]">{t.manualNote}</p>
        </div>
      )}
      {confirmed && order.deliveryMethod === "pickup" && (
        <div className="rounded-[var(--t-radius)] border border-[var(--c-accent)] p-4">
          <p className="font-semibold">{order.fulfillmentStatus === "fulfilled" ? t.pickedUp : order.pickupReadyAt ? t.ready : t.pickup}</p>
          {order.fulfillmentStatus !== "fulfilled" && <p className="mt-1 whitespace-pre-line text-sm text-[var(--c-muted)]">{store.pickupAddress}{store.pickupInstructions ? `\n${store.pickupInstructions}` : ""}</p>}
        </div>
      )}
      {order.fulfillmentStatus === "fulfilled" && order.deliveryMethod !== "pickup" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--t-radius)] border border-[var(--c-accent)] p-4">
          <span>
            <span className="font-semibold">{t.onItsWay}</span>
            {order.trackingNumber && <span className="block text-sm text-[var(--c-muted)]">{carrier(order.trackingCarrier)} · <span className="font-mono">{order.trackingNumber}</span></span>}
          </span>
          {trackingLink(order) && <a href={trackingLink(order)!} target="_blank" rel="noopener noreferrer" className="rounded-[var(--t-radius)] bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-accent-text)]">{t.track}</a>}
        </div>
      )}
      <div className="rounded-[var(--t-radius)] bg-[var(--c-surface)] p-5">
        <ul className="flex flex-col gap-3">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3">
              <Thumb image={i.image} hue={i.hue} title={i.productTitle} rounded="rounded-[var(--t-radius)]" className="h-14 w-12 text-sm" />
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-medium">{i.productTitle}</div>
                <div className="text-[var(--c-muted)]">{i.variantTitle !== "Par défaut" ? `${i.variantTitle} · ` : ""}× {i.quantity}</div>
              </div>
              <span className="text-sm tabular-nums">{m(i.priceCents * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between border-t border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] pt-3 font-semibold tabular-nums"><span>{onTerms || manual ? t.totalDue : t.totalPaid}</span><span>{formatMoney(cur.total, cur.currency, intlLocale(locale))}</span></div>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {confirmed && <a href={`/print/invoice/${order.id}`} target="_blank" className="rounded-[var(--t-radius)] border border-[var(--c-text)] px-6 py-3 font-semibold">{t.invoice}</a>}
        <a href={`/s/${slug}`} className="rounded-[var(--t-radius)] border border-[var(--c-text)] px-6 py-3 font-semibold">{t.back}</a>
      </div>
    </div>
  );
}
