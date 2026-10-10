import { notFound } from "next/navigation";
import { Thumb } from "@/components/ui";
import { db } from "@/lib/db";
import { invoicePayable } from "@/lib/invoices";
import { formatMoney } from "@/lib/money";
import { getStore } from "@/lib/storefront";
import { demoPaymentsAllowed, getStripe } from "@/lib/stripe";

export const metadata = { title: "Régler ma commande", robots: { index: false } };

const ERRORS: Record<string, string> = {
  min: "Le montant est trop faible pour un paiement par carte. Contactez la boutique.",
  off: "Le paiement en ligne n'est pas encore activé pour cette boutique. Contactez-la pour régler autrement.",
};

export default async function PayPage({ params, searchParams }: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ err?: string }> }) {
  const [{ slug, token }, { err }] = await Promise.all([params, searchParams]);
  const { store } = await getStore(slug);
  const order = await db.order.findFirst({ where: { payToken: token, storeId: store.id }, include: { items: true } });
  if (!order) notFound();
  const m = (c: number) => formatMoney(c, store.currency);
  const card = Boolean(getStripe() && store.stripeAccountId && store.stripeChargesEnabled);
  const payable = invoicePayable(order);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-14">
      <div className="text-center">
        <h1 className="font-[family-name:var(--t-display)] text-3xl font-semibold">Commande #{order.number}</h1>
        <p className="mt-1 text-[var(--c-muted)]">Pour {order.name}</p>
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
          <dt className="text-[var(--c-muted)]">Sous-total</dt><dd className="text-right">{m(order.subtotalCents)}</dd>
          {order.discountCents > 0 && <><dt className="text-[var(--c-muted)]">Remise</dt><dd className="text-right">−{m(order.discountCents)}</dd></>}
          <dt className="text-[var(--c-muted)]">Livraison</dt><dd className="text-right">{order.shippingCents ? m(order.shippingCents) : "Offerte"}</dd>
          <dt className="pt-1 text-base font-semibold">Total</dt><dd className="pt-1 text-right text-base font-semibold">{m(order.totalCents)}</dd>
        </dl>
      </div>
      {err && ERRORS[err] && <p role="alert" className="rounded-[var(--t-radius)] border border-red-600 px-4 py-3 text-sm text-red-700">{ERRORS[err]}</p>}
      {payable ? (
        <form action={`/s/${slug}/pay/${token}/checkout`} method="post" className="flex flex-col items-center gap-2">
          <button className="w-full rounded-[var(--t-radius)] bg-[var(--c-accent)] px-6 py-3.5 font-semibold text-[var(--c-accent-text)]">Payer {m(order.totalCents)}</button>
          <p className="text-center text-xs text-[var(--c-muted)]">{card ? "Paiement sécurisé par carte bancaire (Stripe)." : demoPaymentsAllowed() ? "Mode démonstration : aucun paiement réel ne sera effectué." : ""}</p>
        </form>
      ) : (
        <p className="rounded-[var(--t-radius)] bg-[var(--c-surface)] p-5 text-center">
          {order.cancelledAt ? "Cette commande a été annulée." : <>Cette commande est déjà réglée. <a href={`/s/${slug}/order/${order.id}`} className="underline underline-offset-4">Voir la commande</a></>}
        </p>
      )}
    </div>
  );
}
