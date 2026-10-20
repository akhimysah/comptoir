import { redirect } from "next/navigation";
import { customerSubscription, logout, redeemPoints, updateName } from "./actions";
import { getCustomer } from "@/lib/customer-auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { getStore } from "@/lib/storefront";
import { carrierLabel, trackingLink } from "@/lib/tracking";
import { RETURN_STATUS, returnBlocker, returnLines } from "@/lib/returns";
import { dict, intlLocale, type Locale } from "@/lib/i18n";

const T = dict(
  {
    title: "Mon compte",
    status: { cancelled: "Annulée", refunded: "Remboursée", pending: "Paiement en attente", pickedUp: "Récupérée", ready: "Prête à retirer", preparing: "En préparation", shipped: "Expédiée" },
    returnStatus: {} as Record<string, string>,
    hello: (name: string) => `Bonjour ${name}`,
    logout: "Se déconnecter",
    subscriptions: "Mes abonnements",
    perWeek: "par semaine",
    perMonth: "par mois",
    paused: "en pause",
    next: (date: string) => `prochaine livraison le ${date}`,
    pause: "Mettre en pause",
    resume: "Reprendre",
    cancel: "Résilier",
    orders: "Mes commandes",
    returnSent: "Votre demande de retour est envoyée. Vous recevrez une réponse par e-mail.",
    order: (n: number) => `Commande #${n}`,
    items: (n: number) => `${n} article(s)`,
    carrier: "Transporteur",
    track: (carrier: string) => `Suivre mon colis (${carrier})`,
    returnOf: (n: number) => `Retour de ${n} article(s) · `,
    returnItems: "Retourner des articles",
    noOrders: "Vous n'avez pas encore passé de commande. ",
    discover: "Découvrir les produits",
    loyalty: "Ma fidélité",
    points: "points",
    credit: "Crédit en magasin",
    creditHint: "Déduit automatiquement de votre prochaine commande.",
    earn: (per: number, unit: string, reward: number, amount: string) => `${per} point${per > 1 ? "s" : ""} par ${unit === "EUR" ? "euro" : unit} dépensé. ${reward} points = un bon de ${amount}.`,
    voucher: "Votre bon : ",
    voucherHint: ", à saisir dans le panier.",
    redeem: (amount: string) => `Obtenir un bon de ${amount}`,
    vouchers: "Mes bons à utiliser",
    details: "Mes informations",
    name: "Nom",
    save: "Enregistrer",
    saved: "Enregistré.",
  },
  {
    title: "My account",
    status: { cancelled: "Cancelled", refunded: "Refunded", pending: "Payment pending", pickedUp: "Picked up", ready: "Ready for pickup", preparing: "Processing", shipped: "Shipped" },
    returnStatus: { requested: "Requested", approved: "Approved", received: "Received", refunded: "Refunded", declined: "Declined" } as Record<string, string>,
    hello: (name: string) => `Hello ${name}`,
    logout: "Sign out",
    subscriptions: "My subscriptions",
    perWeek: "per week",
    perMonth: "per month",
    paused: "paused",
    next: (date: string) => `next delivery on ${date}`,
    pause: "Pause",
    resume: "Resume",
    cancel: "Cancel",
    orders: "My orders",
    returnSent: "Your return request has been sent. You'll receive a reply by email.",
    order: (n: number) => `Order #${n}`,
    items: (n: number) => `${n} item${n > 1 ? "s" : ""}`,
    carrier: "Carrier",
    track: (carrier: string) => `Track my parcel (${carrier})`,
    returnOf: (n: number) => `Return of ${n} item${n > 1 ? "s" : ""} · `,
    returnItems: "Return items",
    noOrders: "You haven't placed any orders yet. ",
    discover: "Browse products",
    loyalty: "My rewards",
    points: "points",
    credit: "Store credit",
    creditHint: "Automatically applied to your next order.",
    earn: (per: number, unit: string, reward: number, amount: string) => `${per} point${per > 1 ? "s" : ""} per ${unit === "EUR" ? "euro" : unit} spent. ${reward} points = a ${amount} voucher.`,
    voucher: "Your voucher: ",
    voucherHint: ", to enter in your cart.",
    redeem: (amount: string) => `Get a ${amount} voucher`,
    vouchers: "My vouchers",
    details: "My details",
    name: "Name",
    save: "Save",
    saved: "Saved.",
  },
);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { locale } = await getStore((await params).slug);
  return { title: T[locale].title };
}

const STATUS = (o: { cancelledAt: Date | null; paymentStatus: string; fulfillmentStatus: string; deliveryMethod: string; pickupReadyAt: Date | null }, locale: Locale) => {
  const s = T[locale].status;
  return o.cancelledAt ? s.cancelled : o.paymentStatus === "refunded" ? s.refunded : o.paymentStatus === "pending" ? s.pending
    : o.deliveryMethod === "pickup" ? (o.fulfillmentStatus === "fulfilled" ? s.pickedUp : o.pickupReadyAt ? s.ready : s.preparing)
    : o.fulfillmentStatus === "fulfilled" ? s.shipped : s.preparing;
};

export default async function AccountPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ saved?: string; code?: string; err?: string; return?: string }> }) {
  const [{ slug }, { saved, code, err, return: returned }] = await Promise.all([params, searchParams]);
  const { store, locale } = await getStore(slug);
  const t = T[locale];
  const money = (c: number) => formatMoney(c, store.currency, intlLocale(locale));
  const date = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString(intlLocale(locale), opts);
  const customer = await getCustomer(store.id);
  if (!customer) redirect(`/s/${slug}/account/login`);
  const orders = await db.order.findMany({ where: { storeId: store.id, OR: [{ customerId: customer.id }, { email: customer.email }] }, include: { items: true, returns: { orderBy: { createdAt: "desc" } } }, orderBy: { createdAt: "desc" } });
  const subs = await db.subscription.findMany({ where: { storeId: store.id, customerId: customer.id, status: { not: "cancelled" } }, orderBy: { createdAt: "desc" } });
  const vouchers = store.loyaltyEnabled ? await db.discount.findMany({ where: { storeId: store.id, customerEmail: customer.email, usageCount: 0 }, orderBy: { createdAt: "desc" } }) : [];
  const progress = Math.min(100, Math.round((customer.points / store.loyaltyRewardPoints) * 100));
  const field = "w-full rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] bg-[var(--c-surface)] px-3 py-2.5 outline-none focus:border-[var(--c-text)]";

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--t-display)] text-3xl font-semibold">{t.hello(customer.name)}</h1>
          <p className="text-[var(--c-muted)]">{customer.email}</p>
        </div>
        <form action={logout}><input type="hidden" name="slug" value={slug} /><button className="text-sm underline underline-offset-4">{t.logout}</button></form>
      </div>
      <div className="grid gap-10 md:grid-cols-[1fr_260px]">
        <section className="flex flex-col gap-10">
          {subs.length > 0 && (
            <div>
              <h2 className="mb-4 font-[family-name:var(--t-display)] text-xl font-semibold">{t.subscriptions}</h2>
              <ul className="flex flex-col gap-3">
                {subs.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--t-radius)] bg-[var(--c-surface)] p-4">
                    <span>
                      <span className="font-semibold">{s.quantity} × {s.productTitle}</span>
                      <span className="block text-sm text-[var(--c-muted)]">{money(s.priceCents * s.quantity)} {s.interval === "week" ? t.perWeek : t.perMonth} · {s.status === "paused" ? t.paused : t.next(date(s.nextBillingAt, { day: "numeric", month: "long" }))}</span>
                    </span>
                    <span className="flex gap-2">
                      <form action={customerSubscription}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={s.id} /><input type="hidden" name="status" value={s.status === "active" ? "paused" : "active"} /><button className="rounded-[var(--t-radius)] border border-[var(--c-text)] px-3 py-1.5 text-sm">{s.status === "active" ? t.pause : t.resume}</button></form>
                      <form action={customerSubscription}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={s.id} /><input type="hidden" name="status" value="cancelled" /><button className="px-2 py-1.5 text-sm underline underline-offset-4">{t.cancel}</button></form>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
          <h2 className="mb-4 font-[family-name:var(--t-display)] text-xl font-semibold">{t.orders}</h2>
          {returned && <p role="status" className="mb-4 rounded-[var(--t-radius)] border border-[var(--c-accent)] px-4 py-3 text-sm">{t.returnSent}</p>}
          {orders.length ? (
            <ul className="flex flex-col divide-y divide-[color-mix(in_srgb,var(--c-text)_12%,transparent)]">
              {orders.map((o) => (
                <li key={o.id}>
                  <a href={`/s/${slug}/order/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 py-4 hover:opacity-80">
                    <span>
                      <span className="font-semibold">{t.order(o.number)}</span>
                      <span className="block text-sm text-[var(--c-muted)]">{date(o.createdAt, { day: "numeric", month: "long", year: "numeric" })} · {t.items(o.items.reduce((s, i) => s + i.quantity, 0))}</span>
                    </span>
                    <span className="text-right">
                      <span className="block tabular-nums">{money(o.totalCents)}</span>
                      <span className="text-sm text-[var(--c-muted)]">{STATUS(o, locale)}</span>
                    </span>
                  </a>
                  {o.fulfillmentStatus === "fulfilled" && trackingLink(o) && (
                    <a href={trackingLink(o)!} target="_blank" rel="noopener noreferrer" className="-mt-2 mb-3 mr-4 inline-block text-sm font-semibold underline underline-offset-4">{t.track(o.trackingCarrier === "other" ? t.carrier : carrierLabel(o.trackingCarrier))}</a>
                  )}
                  {o.returns.map((r) => (
                    <p key={r.id} className="-mt-2 pb-3 text-sm text-[var(--c-muted)]">
                      {t.returnOf(returnLines(r).reduce((s, l) => s + l.quantity, 0))}<b className="font-semibold text-[var(--c-text)]">{t.returnStatus[r.status] ?? RETURN_STATUS[r.status as keyof typeof RETURN_STATUS]?.label ?? r.status}</b>
                      {r.status === "declined" && r.declineReason ? ` · ${r.declineReason}` : ""}
                    </p>
                  ))}
                  {!returnBlocker(store, o) && <a href={`/s/${slug}/account/returns/${o.id}`} className="-mt-2 mb-3 inline-block text-sm underline underline-offset-4">{t.returnItems}</a>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[var(--c-muted)]">{t.noOrders}<a href={`/s/${slug}/products`} className="underline underline-offset-4">{t.discover}</a></p>
          )}
          </div>
        </section>
        <aside className="flex flex-col gap-8">
          {store.storeCreditEnabled && customer.storeCreditCents > 0 && (
            <section className="flex flex-col gap-2 rounded-[var(--t-radius)] bg-[var(--c-surface)] p-5">
              <h2 className="font-[family-name:var(--t-display)] text-xl font-semibold">{t.credit}</h2>
              <div className="text-3xl font-semibold tabular-nums">{formatMoney(customer.storeCreditCents, store.currency, intlLocale(locale))}</div>
              <p className="text-sm text-[var(--c-muted)]">{t.creditHint}</p>
            </section>
          )}
          {store.loyaltyEnabled && (
            <section className="flex flex-col gap-3 rounded-[var(--t-radius)] bg-[var(--c-surface)] p-5">
              <h2 className="font-[family-name:var(--t-display)] text-xl font-semibold">{t.loyalty}</h2>
              <div className="text-3xl font-semibold tabular-nums">{customer.points} <span className="text-base font-normal text-[var(--c-muted)]">{t.points}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--c-text)_10%,transparent)]"><div className="h-full bg-[var(--c-accent)]" style={{ width: `${progress}%` }} /></div>
              <p className="text-sm text-[var(--c-muted)]">{t.earn(store.loyaltyPointsPerUnit, store.currency, store.loyaltyRewardPoints, money(store.loyaltyRewardCents))}</p>
              {code && <p role="status" className="rounded-[var(--t-radius)] border border-[var(--c-accent)] px-3 py-2 text-sm">{t.voucher}<b className="font-mono">{code}</b>{t.voucherHint}</p>}
              {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
              <form action={redeemPoints}>
                <input type="hidden" name="slug" value={slug} />
                <button disabled={customer.points < store.loyaltyRewardPoints} className="w-full rounded-[var(--t-radius)] bg-[var(--c-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--c-accent-text)] disabled:opacity-40">{t.redeem(money(store.loyaltyRewardCents))}</button>
              </form>
              {vouchers.length > 0 && (
                <div className="text-sm"><p className="mb-1 font-semibold">{t.vouchers}</p>{vouchers.map((v) => <div key={v.id} className="flex justify-between"><span className="font-mono">{v.code}</span><span>{money(v.value)}</span></div>)}</div>
              )}
            </section>
          )}
          <div>
          <h2 className="mb-4 font-[family-name:var(--t-display)] text-xl font-semibold">{t.details}</h2>
          <form action={updateName} className="flex flex-col gap-2">
            <input type="hidden" name="slug" value={slug} />
            <label className="text-sm">{t.name}<input name="name" defaultValue={customer.name} maxLength={80} className={`${field} mt-1`} /></label>
            <button className="self-start rounded-[var(--t-radius)] border border-[var(--c-text)] px-4 py-2 text-sm font-semibold">{t.save}</button>
            {saved && <p role="status" className="text-sm text-[var(--c-muted)]">{t.saved}</p>}
          </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
