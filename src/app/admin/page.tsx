import Link from "next/link";
import { Icon } from "@/components/admin/Nav";
import { Pill } from "@/components/ui";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { FULFILLMENT_LABELS, PAYMENT_LABELS } from "@/lib/orders";
import { stripeConfigured } from "@/lib/stripe";
import { cx, formatDateTime } from "@/lib/utils";

const DAYS = 30;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string; denied?: string }> }) {
  const { welcome, denied } = await searchParams;
  const { user, store, isOwner } = await requireStore();
  const since = new Date(Date.now() - DAYS * 86400_000);
  since.setHours(0, 0, 0, 0);
  const prevSince = new Date(since.getTime() - DAYS * 86400_000);

  const [paid, prevPaid, recent, toShip, unpaid, outOfStock, productCount] = await Promise.all([
    db.order.findMany({ where: { storeId: store.id, paymentStatus: { in: ["paid", "partially_refunded"] }, cancelledAt: null, createdAt: { gte: since } }, select: { totalCents: true, refundedCents: true, createdAt: true, fulfillmentStatus: true } }),
    db.order.findMany({ where: { storeId: store.id, paymentStatus: { in: ["paid", "partially_refunded"] }, cancelledAt: null, createdAt: { gte: prevSince, lt: since } }, select: { totalCents: true, refundedCents: true } }),
    db.order.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 6, include: { items: true } }),
    db.order.count({ where: { storeId: store.id, paymentStatus: { in: ["paid", "partially_refunded"] }, fulfillmentStatus: "unfulfilled", cancelledAt: null } }),
    db.order.count({ where: { storeId: store.id, paymentStatus: "pending", cancelledAt: null } }),
    db.product.count({ where: { storeId: store.id, status: "active", variants: { every: { stock: { lte: 0 } } } } }),
    db.product.count({ where: { storeId: store.id } }),
  ]);

  const revenue = paid.reduce((s, o) => s + o.totalCents - o.refundedCents, 0);
  const prevRevenue = prevPaid.reduce((s, o) => s + o.totalCents - o.refundedCents, 0);
  const aov = paid.length ? Math.round(revenue / paid.length) : 0;
  const fulfilled = paid.filter((o) => o.fulfillmentStatus === "fulfilled").length;

  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    return { d, v: 0, n: 0 };
  });
  for (const o of paid) {
    const i = Math.floor((o.createdAt.getTime() - since.getTime()) / 86400_000);
    if (days[i]) { days[i].v += o.totalCents - o.refundedCents; days[i].n += 1; }
  }
  const m = (c: number) => formatMoney(c, store.currency);
  const delta = prevRevenue ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : null;

  const metrics = [
    { label: "Ventes totales", value: m(revenue), series: days.map((d) => d.v), delta },
    { label: "Commandes", value: String(paid.length), series: days.map((d) => d.n), delta: null },
    { label: "Valeur moyenne des commandes", value: m(aov), series: days.map((d) => (d.n ? d.v / d.n : 0)), delta: null },
    { label: "Commandes traitées", value: String(fulfilled), series: days.map((d) => d.n), delta: null },
  ];

  const todo = [
    { n: toShip, label: `commande${toShip > 1 ? "s" : ""} à traiter`, href: "/admin/orders?tab=toship" },
    { n: unpaid, label: `paiement${unpaid > 1 ? "s" : ""} en attente`, href: "/admin/orders?tab=unpaid" },
    { n: outOfStock, label: `produit${outOfStock > 1 ? "s" : ""} en rupture de stock`, href: "/admin/products" },
  ].filter((t) => t.n > 0);

  const setup = [
    { done: productCount > 0, label: "Ajouter votre premier produit", href: "/admin/products/new" },
    { done: Boolean(store.themeUpdatedAt), label: "Personnaliser votre boutique en ligne", href: "/admin/theme" },
    { done: store.stripeChargesEnabled, label: "Configurer les paiements", href: "/admin/settings#paiements" },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="btn"><Icon name="orders" className="h-4 w-4" />30 derniers jours</span>
        <span className="btn">Tous les canaux</span>
        {welcome && <span className="ml-auto text-[13px] font-[550]">Bienvenue, {user.name.split(" ")[0]} !</span>}
      </div>

      {denied && <p role="alert" className="card bg-[#fff8db] px-4 py-3 text-[13px]">Cette page est réservée au propriétaire de la boutique.</p>}

      {isOwner && setup.some((s) => !s.done) && (
        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-[650]">Guide de configuration</h2>
            <span className="text-xs text-muted">{setup.filter((s) => s.done).length} sur {setup.length} tâches terminées</span>
          </div>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[#ebebeb]"><div className="h-full rounded-full bg-[#303030]" style={{ width: `${(setup.filter((s) => s.done).length / setup.length) * 100}%` }} /></div>
          <ul className="flex flex-col">
            {setup.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-[#f7f7f7]">
                  <span className={cx("grid h-5 w-5 place-items-center rounded-full border-[1.5px]", s.done ? "border-[#303030] bg-[#303030] text-white" : "border-dashed border-[#8a8a8a]")}>
                    {s.done && <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="m5 10.5 3 3 7-7" /></svg>}
                  </span>
                  <span className={s.done ? "text-muted line-through" : "font-[550]"}>{s.label}</span>
                </Link>
              </li>
            ))}
          </ul>
          {!stripeConfigured() && <p className="mt-2 px-2 text-xs text-muted">Sans clé Stripe sur la plateforme, les commandes passent en paiement de démonstration.</p>}
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="grid grid-cols-2 border-b border-line lg:grid-cols-4">
          {metrics.map((mt, i) => (
            <div key={mt.label} className={cx("flex flex-col gap-1 p-4", i % 2 === 1 && "border-l border-line", i === 2 && "lg:border-l", i >= 2 && "border-t border-line lg:border-t-0")}>
              <span className="w-fit border-b border-dashed border-[#b5b5b5] text-xs font-[550] text-muted">{mt.label}</span>
              <div className="flex items-end justify-between gap-2">
                <span className="text-lg font-bold tabular-nums">{mt.value}</span>
                <Spark values={mt.series} />
              </div>
              {mt.delta !== null && <span className={cx("text-xs font-[550]", mt.delta >= 0 ? "text-[#0c5132]" : "text-[#8e0b21]")}>{mt.delta >= 0 ? "↗" : "↘"} {Math.abs(mt.delta)} %</span>}
            </div>
          ))}
        </div>
        <div className="p-4"><SalesChart days={days} currency={store.currency} /></div>
      </section>

      {todo.length > 0 && (
        <section className="flex flex-wrap gap-2">
          {todo.map((t) => (
            <Link key={t.label} href={t.href} className="card flex items-center gap-2 px-3 py-2 hover:bg-[#f7f7f7]">
              <span className="rounded-md bg-[#ffeb78] px-1.5 text-xs font-[650] text-[#4f4700] tabular-nums">{t.n}</span>
              <span className="font-[550]">{t.label}</span>
              <span className="text-muted">›</span>
            </Link>
          ))}
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="card-h"><h2 className="text-sm font-[650]">Commandes récentes</h2><Link href="/admin/orders" className="text-[13px] text-pine hover:underline">Tout afficher</Link></div>
        {recent.length > 0 && (
          <ul className="md:hidden">
            {recent.map((o) => (
              <li key={o.id} className="border-b border-line last:border-0">
                <Link href={`/admin/orders/${o.id}`} className="flex flex-col gap-1 px-4 py-2.5">
                  <span className="flex justify-between gap-2"><span className="truncate"><b>#{o.number}</b> · {o.name}</span><span className="num">{m(o.totalCents)}</span></span>
                  <span className="flex flex-wrap gap-1">{o.cancelledAt ? <Pill>Annulée</Pill> : <><Pill tone={PAYMENT_LABELS[o.paymentStatus].tone}>{PAYMENT_LABELS[o.paymentStatus].label}</Pill><Pill tone={FULFILLMENT_LABELS[o.fulfillmentStatus].tone}>{FULFILLMENT_LABELS[o.fulfillmentStatus].label}</Pill></>}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {recent.length ? (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full">
              <thead><tr><th className="th">Commande</th><th className="th">Date</th><th className="th">Client</th><th className="th text-right">Total</th><th className="th">Statut du paiement</th><th className="th">Statut du traitement</th></tr></thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id} className="hover:bg-[#f7f7f7]">
                    <td className="td"><Link href={`/admin/orders/${o.id}`} className="font-[650] hover:underline">#{o.number}</Link></td>
                    <td className="td whitespace-nowrap text-muted">{formatDateTime(o.createdAt)}</td>
                    <td className="td">{o.name}</td>
                    <td className="td num text-right">{m(o.totalCents)}</td>
                    <td className="td">{o.cancelledAt ? <Pill tone="neutral">Annulée</Pill> : <Pill tone={PAYMENT_LABELS[o.paymentStatus].tone}>{PAYMENT_LABELS[o.paymentStatus].label}</Pill>}</td>
                    <td className="td">{!o.cancelledAt && <Pill tone={FULFILLMENT_LABELS[o.fulfillmentStatus].tone}>{FULFILLMENT_LABELS[o.fulfillmentStatus].label}</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-10 text-center text-muted">Aucune commande pour l'instant. Partagez votre boutique : chaque achat apparaîtra ici.</p>
        )}
      </section>
    </>
  );
}

function Spark({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 80},${22 - (v / max) * 20}`).join(" ");
  return (
    <svg viewBox="0 0 80 24" className="h-6 w-20" aria-hidden>
      <polyline points={pts} fill="none" stroke="#4b9fe8" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

function SalesChart({ days, currency }: { days: { d: Date; v: number }[]; currency: string }) {
  const W = 920, H = 220, L = 56, R = 8, T = 10, B = 24;
  const raw = Math.max(...days.map((d) => d.v), 100);
  const steps = [1000, 2000, 5000, 10000, 20000, 25000, 50000, 100000, 200000, 500000, 1000000];
  const step = steps.find((s) => s * 4 >= raw) ?? Math.ceil(raw / 4);
  const max = step * 4;
  const x = (i: number) => L + (i * (W - L - R)) / (days.length - 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const short = (c: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(c / 100);
  const line = days.map((d, i) => `${x(i)},${y(d.v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Ventes par jour sur 30 jours">
      {[0, 1, 2, 3, 4].map((k) => (
        <g key={k}>
          <line x1={L} x2={W - R} y1={y(k * step)} y2={y(k * step)} stroke="#ebebeb" />
          <text x={L - 8} y={y(k * step) + 4} textAnchor="end" className="fill-[#8a8a8a] text-[11px]">{short(k * step)}</text>
        </g>
      ))}
      <polyline points={line} fill="none" stroke="#4b9fe8" strokeWidth={2} strokeLinejoin="round" />
      {days.map((d, i) =>
        i % 6 === 0 || i === days.length - 1 ? (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="fill-[#8a8a8a] text-[11px]">
            {d.d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
          </text>
        ) : null,
      )}
    </svg>
  );
}
