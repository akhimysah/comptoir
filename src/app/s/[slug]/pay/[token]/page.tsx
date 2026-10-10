import { notFound } from "next/navigation";
import { Thumb } from "@/components/ui";
import { db } from "@/lib/db";
import { invoicePayable } from "@/lib/invoices";
import { formatMoney } from "@/lib/money";
import { getStore } from "@/lib/storefront";
import { demoPaymentsAllowed, getStripe } from "@/lib/stripe";
import { dict, intlLocale } from "@/lib/i18n";

const T = dict(
  {
    title: "Régler ma commande",
    errors: {
      min: "Le montant est trop faible pour un paiement par carte. Contactez la boutique.",
      off: "Le paiement en ligne n'est pas encore activé pour cette boutique. Contactez-la pour régler autrement.",
    } as Record<string, string>,
    order: (n: number) => `Commande #${n}`,
    for: (name: string) => `Pour ${name}`,
    subtotal: "Sous-total",
    discount: "Remise",
    shipping: "Livraison",
    free: "Offerte",
    total: "Total",
    pay: (amount: string) => `Payer ${amount}`,
    card: "Paiement sécurisé par carte bancaire (Stripe).",
    demo: "Mode démonstration : aucun paiement réel ne sera effectué.",
    cancelled: "Cette commande a été annulée.",
    paid: "Cette commande est déjà réglée. ",
    view: "Voir la commande",
  },
  {
    title: "Pay for my order",
    errors: {
      min: "The amount is too low for a card payment. Please contact the store.",
      off: "Online payment isn't enabled for this store yet. Please contact them to pay another way.",
    } as Record<string, string>,
    order: (n: number) => `Order #${n}`,
    for: (name: string) => `For ${name}`,
    subtotal: "Subtotal",
    discount: "Discount",
    shipping: "Shipping",
    free: "Free",
    total: "Total",
    pay: (amount: string) => `Pay ${amount}`,
    card: "Secure card payment (Stripe).",
    demo: "Demo mode: no real payment will be made.",
    cancelled: "This order has been cancelled.",
    paid: "This order has already been paid. ",
    view: "View order",
  },
);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { locale } = await getStore((await params).slug);
  return { title: T[locale].title, robots: { index: false } };
}

export default async function PayPage({ params, searchParams }: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ err?: string }> }) {
  const [{ slug, token }, { err }] = await Promise.all([params, searchParams]);
  const { store, locale } = await getStore(slug);
  const t = T[locale];
  const ERRORS = t.errors;
  const order = await db.order.findFirst({ where: { payToken: token, storeId: store.id }, include: { items: true } });
  if (!order) notFound();
  const m = (c: number) => formatMoney(c, store.currency, intlLocale(locale));
  const card = Boolean(getStripe() && store.stripeAccountId && store.stripeChargesEnabled);
  const payable = invoicePayable(order);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-14">
      <div className="text-center">
        <h1 className="font-[family-name:var(--t-display)] text-3xl font-semibold">{t.order(order.number)}</h1>
        <p className="mt-1 text-[var(--c-muted)]">{t.for(order.name)}</p>
      </div>
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
        <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-1 border-t border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] pt-3 text-sm tabular-nums">
          <dt className="text-[var(--c-muted)]">{t.subtotal}</dt><dd className="text-right">{m(order.subtotalCents)}</dd>
          {order.discountCents > 0 && <><dt className="text-[var(--c-muted)]">{t.discount}</dt><dd className="text-right">−{m(order.discountCents)}</dd></>}
          <dt className="text-[var(--c-muted)]">{t.shipping}</dt><dd className="text-right">{order.shippingCents ? m(order.shippingCents) : t.free}</dd>
          <dt className="pt-1 text-base font-semibold">{t.total}</dt><dd className="pt-1 text-right text-base font-semibold">{m(order.totalCents)}</dd>
        </dl>
      </div>
      {err && ERRORS[err] && <p role="alert" className="rounded-[var(--t-radius)] border border-red-600 px-4 py-3 text-sm text-red-700">{ERRORS[err]}</p>}
      {payable ? (
        <form action={`/s/${slug}/pay/${token}/checkout`} method="post" className="flex flex-col items-center gap-2">
          <button className="w-full rounded-[var(--t-radius)] bg-[var(--c-accent)] px-6 py-3.5 font-semibold text-[var(--c-accent-text)]">{t.pay(m(order.totalCents))}</button>
          <p className="text-center text-xs text-[var(--c-muted)]">{card ? t.card : demoPaymentsAllowed() ? t.demo : ""}</p>
        </form>
      ) : (
        <p className="rounded-[var(--t-radius)] bg-[var(--c-surface)] p-5 text-center">
          {order.cancelledAt ? t.cancelled : <>{t.paid}<a href={`/s/${slug}/order/${order.id}`} className="underline underline-offset-4">{t.view}</a></>}
        </p>
      )}
    </div>
  );
}
