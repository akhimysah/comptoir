import Link from "next/link";
import { PageHeader, Thumb } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { cx } from "@/lib/utils";

const PERIODS = { "7": "7 derniers jours", "30": "30 derniers jours", "90": "90 derniers jours", "365": "12 derniers mois" } as const;
type Period = keyof typeof PERIODS;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const period: Period = p && p in PERIODS ? (p as Period) : "30";
  const days = Number(period);
  const { store } = await requirePerm("analytics");
  const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - (days - 1));
  const prevSince = new Date(since); prevSince.setDate(prevSince.getDate() - days);

  const where = { storeId: store.id, paymentStatus: { in: ["paid", "partially_refunded"] }, cancelledAt: null };
  const [orders, prev, firstOrders] = await Promise.all([
    db.order.findMany({ where: { ...where, createdAt: { gte: since } }, include: { items: true } }),
    db.order.findMany({ where: { ...where, createdAt: { gte: prevSince, lt: since } }, select: { totalCents: true, refundedCents: true } }),
    // Première commande payée de chaque client, pour distinguer nouveaux clients et clients fidèles.
    db.order.groupBy({ by: ["customerId"], where: { ...where, customerId: { not: null } }, _min: { createdAt: true } }),
  ]);

  const m = (c: number) => formatMoney(c, store.currency);
  const revenue = orders.reduce((s, o) => s + o.totalCents - o.refundedCents, 0);
  const prevRevenue = prev.reduce((s, o) => s + o.totalCents - o.refundedCents, 0);
  const units = orders.reduce((s, o) => s + o.items.reduce((t, i) => t + i.quantity, 0), 0);
  const aov = orders.length ? Math.round(revenue / orders.length) : 0;
  const firstBy = new Map(firstOrders.map((f) => [f.customerId, f._min.createdAt]));
  const customersInPeriod = new Set(orders.map((o) => o.customerId).filter(Boolean));
  const returning = [...customersInPeriod].filter((id) => (firstBy.get(id) ?? since) < since).length;
  const returningRate = customersInPeriod.size ? Math.round((returning / customersInPeriod.size) * 100) : 0;
  const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);

  // Regroupement par jour, ou par mois sur 12 mois.
  const monthly = days > 90;
  const buckets: { label: string; key: string; v: number }[] = [];
  if (monthly) {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("fr-FR", { month: "short" }), v: 0 });
    }
  } else {
    for (let i = 0; i < days; i++) {
      const d = new Date(since); d.setDate(d.getDate() + i);
      buckets.push({ key: d.toDateString(), label: d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }), v: 0 });
    }
  }
  for (const o of orders) {
    const k = monthly ? `${o.createdAt.getFullYear()}-${o.createdAt.getMonth()}` : new Date(o.createdAt.getFullYear(), o.createdAt.getMonth(), o.createdAt.getDate()).toDateString();
    const b = buckets.find((x) => x.key === k);
    if (b) b.v += o.totalCents - o.refundedCents;
  }

  // Marge brute : prix réellement payé (remise de la commande répartie) moins le coût d'achat, hors articles remboursés.
  // Seuls les articles dont le coût était renseigné au moment de la vente comptent.
  let costedSales = 0, profit = 0, uncosted = 0;
  const byProduct = new Map<string, { title: string; units: number; cents: number; image: string | null; hue: number; sales: number; profit: number }>();
  for (const o of orders) for (const i of o.items) {
    const cur = byProduct.get(i.productTitle) ?? { title: i.productTitle, units: 0, cents: 0, image: i.image, hue: i.hue, sales: 0, profit: 0 };
    cur.units += i.quantity; cur.cents += i.priceCents * i.quantity;
    const kept = i.quantity - i.refundedQuantity;
    if (i.costCents !== null && kept > 0 && !i.isGiftCard) {
      const paid = Math.round(i.priceCents * kept * (o.subtotalCents ? 1 - o.discountCents / o.subtotalCents : 1));
      costedSales += paid; profit += paid - i.costCents * kept;
      cur.sales += paid; cur.profit += paid - i.costCents * kept;
    } else if (kept > 0 && !i.isGiftCard) uncosted += kept;
    byProduct.set(i.productTitle, cur);
  }
  const marginPct = costedSales ? Math.round((profit / costedSales) * 100) : null;
  const top = [...byProduct.values()].sort((a, b) => b.cents - a.cents).slice(0, 8);
  const topMax = Math.max(...top.map((t) => t.cents), 1);

  const channels = [
    { label: "Boutique en ligne", cents: orders.filter((o) => !["manual", "pos_cash", "pos_card"].includes(o.paymentMethod)).reduce((s, o) => s + o.totalCents - o.refundedCents, 0) },
    { label: "Point de vente", cents: orders.filter((o) => o.paymentMethod.startsWith("pos")).reduce((s, o) => s + o.totalCents - o.refundedCents, 0) },
    { label: "Commandes manuelles", cents: orders.filter((o) => o.paymentMethod === "manual").reduce((s, o) => s + o.totalCents - o.refundedCents, 0) },
  ];

  const cards = [
    { label: "Ventes totales", value: m(revenue), delta: pct(revenue, prevRevenue) },
    { label: "Commandes", value: String(orders.length), delta: pct(orders.length, prev.length) },
    { label: "Valeur moyenne des commandes", value: m(aov), delta: null },
    { label: "Articles vendus", value: String(units), delta: null },
    { label: "Taux de clients fidèles", value: `${returningRate} %`, delta: null },
    { label: "Marge brute", value: marginPct === null ? "—" : `${m(profit)} · ${marginPct} %`, delta: null, hint: marginPct === null ? "Renseignez le coût par article de vos produits." : uncosted ? `${uncosted} article(s) vendu(s) sans coût renseigné, non comptés.` : "Sur tous les articles vendus." },
  ];

  return (
    <>
      <PageHeader title="Statistiques" />
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(PERIODS) as Period[]).map((k) => (
          <Link key={k} href={`/admin/analytics?p=${k}`} className={cx("btn", period === k && "bg-[#e3e3e3]")}>{PERIODS[k]}</Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="card flex flex-col gap-1 p-4">
            <span className="w-fit border-b border-dashed border-[#b5b5b5] text-xs font-[550] text-muted">{c.label}</span>
            <span className="text-lg font-bold tabular-nums">{c.value}</span>
            {"hint" in c && c.hint && <span className="text-xs text-muted">{c.hint}</span>}
            {c.delta !== null && <span className={cx("text-xs font-[550]", c.delta >= 0 ? "text-[#0c5132]" : "text-[#8e0b21]")}>{c.delta >= 0 ? "↗" : "↘"} {Math.abs(c.delta)} % vs période précédente</span>}
          </div>
        ))}
      </div>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-[650]">Ventes totales dans le temps</h2>
        <Bars buckets={buckets} currency={store.currency} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="card-h"><h2 className="text-sm font-[650]">Meilleurs produits</h2><span className="text-xs text-muted">par ventes</span></div>
          {top.length ? (
            <ul>
              {top.map((t) => (
                <li key={t.title} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                  <Thumb image={t.image} hue={t.hue} title={t.title} className="h-8 w-8 text-[10px]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2"><span className="truncate font-[550]">{t.title}</span><span className="num">{m(t.cents)}</span></div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#ebebeb]"><div className="h-full rounded-full bg-[#8b5cf6]" style={{ width: `${(t.cents / topMax) * 100}%` }} /></div>
                      <span className="w-16 text-right text-xs text-muted">{t.units} vendu{t.units > 1 ? "s" : ""}</span>
                      {t.sales > 0 && <span className="w-20 text-right text-xs text-muted">marge {Math.round((t.profit / t.sales) * 100)} %</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="px-4 py-10 text-center text-muted">Aucune vente sur cette période.</p>}
        </section>
        <section className="card overflow-hidden">
          <div className="card-h"><h2 className="text-sm font-[650]">Ventes par canal</h2></div>
          <ul>
            {channels.map((c) => (
              <li key={c.label} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                <span className="flex-1 font-[550]">{c.label}</span>
                <span className="text-xs text-muted">{revenue ? Math.round((c.cents / revenue) * 100) : 0} %</span>
                <span className="num w-24 text-right">{m(c.cents)}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-4 py-3 text-xs text-muted">
            {customersInPeriod.size} client{customersInPeriod.size > 1 ? "s" : ""} sur la période, dont {returning} déjà client{returning > 1 ? "s" : ""} auparavant.
          </div>
        </section>
      </div>
    </>
  );
}

function Bars({ buckets, currency }: { buckets: { label: string; v: number }[]; currency: string }) {
  const W = 920, H = 220, L = 56, R = 8, T = 10, B = 24;
  const raw = Math.max(...buckets.map((b) => b.v), 100);
  const steps = [1000, 2000, 5000, 10000, 20000, 25000, 50000, 100000, 200000, 500000, 1000000, 2000000, 5000000];
  const step = steps.find((s) => s * 4 >= raw) ?? Math.ceil(raw / 4);
  const max = step * 4;
  const bw = (W - L - R) / buckets.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const short = (c: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(c / 100);
  const every = Math.ceil(buckets.length / 10);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Ventes dans le temps">
      {[0, 1, 2, 3, 4].map((k) => (
        <g key={k}>
          <line x1={L} x2={W - R} y1={y(k * step)} y2={y(k * step)} stroke="#ebebeb" />
          <text x={L - 8} y={y(k * step) + 4} textAnchor="end" className="fill-[#8a8a8a] text-[11px]">{short(k * step)}</text>
        </g>
      ))}
      {buckets.map((b, i) => (
        <rect key={i} x={L + i * bw + bw * 0.15} width={Math.max(1, bw * 0.7)} y={y(b.v)} height={Math.max(0, y(0) - y(b.v))} rx={2} fill="#8b5cf6">
          <title>{`${b.label} : ${short(b.v)}`}</title>
        </rect>
      ))}
      {buckets.map((b, i) => (i % every === 0 ? <text key={`l${i}`} x={L + i * bw + bw / 2} y={H - 6} textAnchor="middle" className="fill-[#8a8a8a] text-[11px]">{b.label}</text> : null))}
    </svg>
  );
}
