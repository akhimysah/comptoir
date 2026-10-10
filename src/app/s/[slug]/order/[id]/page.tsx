import { notFound } from "next/navigation";
import { ClearCart } from "@/components/store/ClearCart";
import { TrackPurchase } from "@/components/store/Tracking";
import { Thumb } from "@/components/ui";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { markOrderPaid } from "@/lib/orders";
import { getStore } from "@/lib/storefront";
import { getStripe } from "@/lib/stripe";
import { carrierLabel, trackingLink } from "@/lib/tracking";

export const metadata = { title: "Commande confirmée" };

export default async function OrderConfirmation({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { store } = await getStore(slug);
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
  const m = (c: number) => formatMoney(c, store.currency);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8 px-4 py-16">
      {paid && <ClearCart slug={slug} />}
      {paid && (store.gaId || store.metaPixelId) && <TrackPurchase orderId={order.id} valueCents={order.totalCents} currency={store.currency} />}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--c-accent)] text-2xl text-[var(--c-accent-text)]">{paid ? "✓" : "…"}</div>
        <h1 className="font-[family-name:var(--t-display)] text-3xl font-semibold">{paid ? `Merci ${order.name.split(" ")[0]} !` : "Paiement en cours de validation"}</h1>
        <p className="text-[var(--c-muted)]">
          {paid
            ? <>Votre commande <b className="tabular-nums">#{order.number}</b> est confirmée. Gardez ce numéro : la boutique vous contactera à {order.email} si besoin.</>
            : "Nous attendons la confirmation de votre banque. Rechargez cette page dans quelques instants."}
        </p>
      </div>
      {order.fulfillmentStatus === "fulfilled" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--t-radius)] border border-[var(--c-accent)] p-4">
          <span>
            <span className="font-semibold">Votre commande est en route</span>
            {order.trackingNumber && <span className="block text-sm text-[var(--c-muted)]">{carrierLabel(order.trackingCarrier)} · <span className="font-mono">{order.trackingNumber}</span></span>}
          </span>
          {trackingLink(order) && <a href={trackingLink(order)!} target="_blank" rel="noopener noreferrer" className="rounded-[var(--t-radius)] bg-[var(--c-accent)] px-4 py-2 text-sm font-semibold text-[var(--c-accent-text)]">Suivre mon colis</a>}
        </div>
      )}
      <div className="rounded-[var(--t-radius)] bg-[var(--c-surface)] p-5">
        <ul className="flex flex-col gap-3">
          {order.items.map((i) => (
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
        <div className="mt-4 flex justify-between border-t border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] pt-3 font-semibold tabular-nums"><span>Total payé</span><span>{m(order.totalCents)}</span></div>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {paid && <a href={`/print/invoice/${order.id}`} target="_blank" className="rounded-[var(--t-radius)] border border-[var(--c-text)] px-6 py-3 font-semibold">Télécharger la facture</a>}
        <a href={`/s/${slug}`} className="rounded-[var(--t-radius)] border border-[var(--c-text)] px-6 py-3 font-semibold">Retour à la boutique</a>
      </div>
    </div>
  );
}
