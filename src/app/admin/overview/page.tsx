import Link from "next/link";
import { sendMyDailyReport, setDailyReport } from "./actions";
import { PageHeader, Pill } from "@/components/ui";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { FULFILLMENT_LABELS, PAYMENT_LABELS } from "@/lib/orders";
import { cx, formatDateTime, initials } from "@/lib/utils";

const PERIODS = { "1": "Aujourd'hui", "7": "7 derniers jours", "30": "30 derniers jours", "90": "90 derniers jours" } as const;
type Period = keyof typeof PERIODS;
const STORE_COLORS = ["#4b9fe8", "#e3a008", "#2c9a62", "#c4458a", "#7c5cd6", "#e0613a", "#3aa7a1", "#8a8a8a"];

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ p?: string; sent?: string }> }) {
  const { p, sent } = await searchParams;
  const period: Period = p && p in PERIODS ? (p as Period) : "30";
  const days = Number(period);
  const { user, stores } = await requireStore();
  const ids = stores.map((s) => s.id);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const since = new Date(today); since.setDate(since.getDate() - (days - 1));
  const prevSince = new Date(since); prevSince.setDate(prevSince.getDate() - days);
  const chartSince = new Date(today); chartSince.setDate(chartSince.getDate() - (Math.max(days, 14) - 1));
  const paid = { storeId: { in: ids }, paymentStatus: { in: ["paid", "partially_refunded"] }, cancelledAt: null };

  const [orders, prevOrders, toShip, recent] = await Promise.all([
    db.order.findMany({ where: { ...paid, createdAt: { gte: new Date(Math.min(since.getTime(), chartSince.getTime())) } }, select: { storeId: true, totalCents: true, refundedCents: true, createdAt: true } }),
    db.order.groupBy({ by: ["storeId"], where: { ...paid, createdAt: { gte: prevSince, lt: since } }, _sum: { totalCents: true, refundedCents: true } }),
    db.order.groupBy({ by: ["storeId"], where: { ...paid, fulfillmentStatus: "unfulfilled" }, _count: true }),
    db.order.findMany({ where: { storeId: { in: ids } }, orderBy: { createdAt: "desc" }, take: 12, include: { store: true } }),
  ]);

  const rows = stores.map((s, i) => {
    const mine = orders.filter((o) => o.storeId === s.id);
    const inPeriod = mine.filter((o) => o.createdAt >= since);
    const todayOrders = mine.filter((o) => o.createdAt >= today);
    const revenue = inPeriod.reduce((t, o) => t + o.totalCents - o.refundedCents, 0);
    const prevSum = prevOrders.find((x) => x.storeId === s.id)?._sum;
    const prev = (prevSum?.totalCents ?? 0) - (prevSum?.refundedCents ?? 0);
    return {
      store: s,
      color: STORE_COLORS[i % STORE_COLORS.length],
      todayRevenue: todayOrders.reduce((t, o) => t + o.totalCents - o.refundedCents, 0),
      todayCount: todayOrders.length,
      revenue,
      count: inPeriod.length,
      aov: inPeriod.length ? Math.round(revenue / inPeriod.length) : 0,
      delta: prev ? Math.round(((revenue - prev) / prev) * 100) : null,
      toShip: toShip.find((x) => x.storeId === s.id)?._count ?? 0,
    };
  });

  // Totaux par devise : on n'additionne jamais des euros et des dollars.
  const currencies = [...new Set(stores.map((s) => s.currency))];
  const totals = currencies.map((cur) => {
    const r = rows.filter((x) => x.store.currency === cur);
    const revenue = r.reduce((t, x) => t + x.revenue, 0), count = r.reduce((t, x) => t + x.count, 0);
    return { cur, todayRevenue: r.reduce((t, x) => t + x.todayRevenue, 0), todayCount: r.reduce((t, x) => t + x.todayCount, 0), revenue, count, aov: count ? Math.round(revenue / count) : 0, toShip: r.reduce((t, x) => t + x.toShip, 0) };
  });
  const main = totals[0];

  // Chiffre d'affaires jour par jour et par boutique (devise principale).
  const chartDays: Date[] = [];
  for (let d = new Date(chartSince); d <= today; d.setDate(d.getDate() + 1)) chartDays.push(new Date(d));
  const daily = chartDays.map((d) => {
    const k = dayKey(d);
    const per = rows.map((r) => orders.filter((o) => o.storeId === r.store.id && dayKey(o.createdAt) === k).reduce((t, o) => t + o.totalCents - o.refundedCents, 0));
    return { d, per, total: per.reduce((a, b) => a + b, 0) };
  });
  const chartRows = rows.filter((r) => r.store.currency === main.cur);

  return (
    <>
      <PageHeader
        title="Toutes les boutiques"
        subtitle={`${stores.length} boutique${stores.length > 1 ? "s" : ""} · chiffres des commandes payées`}
        actions={
          <>
            <form action={sendMyDailyReport}><button className="btn">M'envoyer le rapport d'hier</button></form>
            <Link href="/admin/stores/new" className="btn btn-primary">Créer une boutique</Link>
          </>
        }
      />
      <form action={setDailyReport} className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <input type="hidden" name="on" value={user.dailyReport ? "0" : "1"} />
        <span className="flex-1 text-[13px]"><b>Rapport quotidien par e-mail</b> : le CA et les commandes de la veille de toutes vos boutiques, chaque matin. {user.dailyReport ? "Activé" : "Désactivé"}.</span>
        <button className="btn btn-sm">{user.dailyReport ? "Désactiver" : "Activer"}</button>
      </form>
      {sent && <p role="status" className="card bg-[#cdfee1] px-4 py-3 text-[13px] text-[#0c5132]">Rapport envoyé. Retrouvez-le dans Paramètres → Notifications de votre première boutique si aucun service d'e-mail n'est configuré.</p>}

      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(PERIODS) as Period[]).map((k) => (
          <Link key={k} href={`/admin/overview?p=${k}`} className={cx("btn", period === k && "bg-[#e3e3e3]")}>{PERIODS[k]}</Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["CA aujourd'hui", formatMoney(main.todayRevenue, main.cur), `${main.todayCount} commande${main.todayCount > 1 ? "s" : ""}`],
          [`CA · ${PERIODS[period].toLowerCase()}`, formatMoney(main.revenue, main.cur), `${main.count} commande${main.count > 1 ? "s" : ""}`],
          ["Panier moyen", formatMoney(main.aov, main.cur), "toutes boutiques"],
          ["À expédier", String(main.toShip), "commandes payées non traitées"],
        ].map(([k, v, d]) => (
          <div key={k} className="card flex flex-col gap-1 p-4">
            <span className="text-xs font-[550] text-muted">{k}</span>
            <span className="text-xl font-bold tabular-nums">{v}</span>
            <span className="text-xs text-muted">{d}</span>
          </div>
        ))}
      </div>
      {totals.length > 1 && <p className="text-xs text-muted">Totaux en {main.cur}. Autres devises : {totals.slice(1).map((t) => `${formatMoney(t.revenue, t.cur)} (${t.count} commandes)`).join(", ")}.</p>}

      <section className="card overflow-hidden">
        <div className="card-h"><h2 className="text-sm font-[650]">Par boutique</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr><th className="th">Boutique</th><th className="th text-right">CA aujourd'hui</th><th className="th text-right">Cmd. aujourd'hui</th><th className="th text-right">CA période</th><th className="th text-right">Évolution</th><th className="th text-right">Commandes</th><th className="th text-right">Panier moyen</th><th className="th text-right">À expédier</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const m = (c: number) => formatMoney(c, r.store.currency);
                return (
                  <tr key={r.store.id} className="hover:bg-[#f7f7f7]">
                    <td className="td">
                      <a href={`/admin/switch?store=${r.store.id}`} className="flex items-center gap-2.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#c4b5fd] text-[10px] font-semibold text-[#2e1065]">{initials(r.store.name)}</span>
                        <span className="font-[550] hover:underline">{r.store.name}</span>
                      </a>
                    </td>
                    <td className="td num text-right font-[550]">{m(r.todayRevenue)}</td>
                    <td className="td num text-right">{r.todayCount}</td>
                    <td className="td num text-right font-[550]">{m(r.revenue)}</td>
                    <td className={cx("td num text-right text-xs font-[550]", r.delta === null ? "text-muted" : r.delta >= 0 ? "text-[#0c5132]" : "text-[#8e0b21]")}>{r.delta === null ? "—" : `${r.delta >= 0 ? "↗" : "↘"} ${Math.abs(r.delta)} %`}</td>
                    <td className="td num text-right">{r.count}</td>
                    <td className="td num text-right">{m(r.aov)}</td>
                    <td className="td text-right">{r.toShip ? <a href={`/admin/switch?store=${r.store.id}&to=/admin/orders?tab=toship`}><Pill tone="attention">{r.toShip}</Pill></a> : <span className="text-muted">0</span>}</td>
                  </tr>
                );
              })}
              {totals.map((t) => (
                <tr key={t.cur} className="bg-[#f7f7f7] font-[650]">
                  <td className="td">Total{totals.length > 1 ? ` ${t.cur}` : ""}</td>
                  <td className="td num text-right">{formatMoney(t.todayRevenue, t.cur)}</td>
                  <td className="td num text-right">{t.todayCount}</td>
                  <td className="td num text-right">{formatMoney(t.revenue, t.cur)}</td>
                  <td className="td" />
                  <td className="td num text-right">{t.count}</td>
                  <td className="td num text-right">{formatMoney(t.aov, t.cur)}</td>
                  <td className="td num text-right">{t.toShip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-[650]">Chiffre d'affaires par jour</h2>
          <div className="flex flex-wrap gap-3 text-xs">
            {chartRows.map((r) => <span key={r.store.id} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />{r.store.name}</span>)}
          </div>
        </div>
        <StackedBars days={daily} rows={rows.map((r) => ({ color: r.color, include: r.store.currency === main.cur }))} currency={main.cur} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="card-h"><h2 className="text-sm font-[650]">Jour par jour</h2><span className="text-xs text-muted">{main.cur}</span></div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0"><tr><th className="th">Jour</th>{chartRows.map((r) => <th key={r.store.id} className="th text-right"><span className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} /> <span className="sr-only">{r.store.name}</span>{initials(r.store.name)}</th>)}<th className="th text-right">Total</th></tr></thead>
              <tbody>
                {[...daily].reverse().map((d) => (
                  <tr key={d.d.toISOString()}>
                    <td className="td whitespace-nowrap">{d.d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</td>
                    {rows.map((r, i) => (r.store.currency === main.cur ? <td key={r.store.id} className={cx("td num text-right", !d.per[i] && "text-[#b5b5b5]")}>{formatMoney(d.per[i], main.cur)}</td> : null))}
                    <td className="td num text-right font-[650]">{formatMoney(rows.reduce((t, r, i) => t + (r.store.currency === main.cur ? d.per[i] : 0), 0), main.cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="card-h"><h2 className="text-sm font-[650]">Dernières commandes, toutes boutiques</h2></div>
          <ul>
            {recent.map((o) => {
              const color = rows.find((r) => r.store.id === o.storeId)?.color;
              return (
                <li key={o.id} className="border-b border-line last:border-0">
                  <a href={`/admin/switch?store=${o.storeId}&to=/admin/orders/${o.id}`} className="flex flex-col gap-1 px-4 py-2.5 hover:bg-[#f7f7f7]">
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} /><b>#{o.number}</b><span className="truncate">{o.name}</span></span>
                      <span className="num">{formatMoney(o.totalCents, o.store.currency)}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      {o.store.name} · {formatDateTime(o.createdAt)}
                      {o.cancelledAt ? <Pill>Annulée</Pill> : <><Pill tone={PAYMENT_LABELS[o.paymentStatus].tone}>{PAYMENT_LABELS[o.paymentStatus].label}</Pill><Pill tone={FULFILLMENT_LABELS[o.fulfillmentStatus].tone}>{FULFILLMENT_LABELS[o.fulfillmentStatus].label}</Pill></>}
                    </span>
                  </a>
                </li>
              );
            })}
            {!recent.length && <li className="px-4 py-10 text-center text-muted">Aucune commande pour l'instant.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}

function StackedBars({ days, rows, currency }: { days: { d: Date; per: number[] }[]; rows: { color: string; include: boolean }[]; currency: string }) {
  const W = 920, H = 220, L = 56, R = 8, T = 10, B = 24;
  const totals = days.map((d) => d.per.reduce((t, v, i) => t + (rows[i].include ? v : 0), 0));
  const raw = Math.max(...totals, 100);
  const steps = [1000, 2000, 5000, 10000, 20000, 25000, 50000, 100000, 200000, 500000, 1000000, 2000000, 5000000];
  const step = steps.find((s) => s * 4 >= raw) ?? Math.ceil(raw / 4);
  const max = step * 4;
  const bw = (W - L - R) / days.length;
  const h = (v: number) => ((H - T - B) * v) / max;
  const y0 = H - B;
  const short = (c: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(c / 100);
  const every = Math.ceil(days.length / 10);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Chiffre d'affaires par jour et par boutique">
      {[0, 1, 2, 3, 4].map((k) => (
        <g key={k}>
          <line x1={L} x2={W - R} y1={y0 - h(k * step)} y2={y0 - h(k * step)} stroke="#ebebeb" />
          <text x={L - 8} y={y0 - h(k * step) + 4} textAnchor="end" className="fill-[#8a8a8a] text-[11px]">{short(k * step)}</text>
        </g>
      ))}
      {days.map((d, i) => {
        let acc = 0;
        return (
          <g key={i}>
            {d.per.map((v, j) => {
              if (!rows[j].include || !v) return null;
              const y = y0 - h(acc + v);
              acc += v;
              return <rect key={j} x={L + i * bw + bw * 0.15} width={Math.max(1, bw * 0.7)} y={y} height={h(v)} fill={rows[j].color}><title>{`${d.d.toLocaleDateString("fr-FR")} : ${short(v)}`}</title></rect>;
            })}
          </g>
        );
      })}
      {days.map((d, i) => (i % every === 0 || i === days.length - 1 ? <text key={`l${i}`} x={L + i * bw + bw / 2} y={H - 6} textAnchor="middle" className="fill-[#8a8a8a] text-[11px]">{i === days.length - 1 ? "auj." : d.d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</text> : null))}
    </svg>
  );
}
