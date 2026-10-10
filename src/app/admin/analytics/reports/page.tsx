import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { buildReport, parseRange, REPORTS, type ReportType } from "@/lib/sales-reports";
import { cx } from "@/lib/utils";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ type?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const { store } = await requirePerm("analytics");
  const type: ReportType = sp.type && sp.type in REPORTS ? (sp.type as ReportType) : "daily";
  const range = parseRange(sp.from, sp.to);
  const report = await buildReport(store, type, range.from, range.to);
  const m = (c: number) => formatMoney(c, store.currency);
  const show = (v: string | number, i: number) => (typeof v === "number" && report.columns[i]?.money ? m(v) : v);
  const qs = (p: Record<string, string>) => new URLSearchParams({ type, from: range.fromStr, to: range.toStr, ...p }).toString();

  const now = new Date();
  const presets = [
    { label: "7 jours", from: iso(new Date(Date.now() - 6 * 86400_000)), to: iso(now) },
    { label: "30 jours", from: iso(new Date(Date.now() - 29 * 86400_000)), to: iso(now) },
    { label: "Ce mois", from: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), to: iso(now) },
    { label: "Mois dernier", from: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))), to: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))) },
    { label: "Cette année", from: `${now.getUTCFullYear()}-01-01`, to: iso(now) },
  ];

  return (
    <>
      <PageHeader back="/admin/analytics" title="Rapports" subtitle="Des chiffres détaillés à consulter ou à exporter pour votre comptabilité." actions={<a href={`/admin/analytics/reports/export?${qs({})}`} className="btn btn-primary">Exporter (CSV)</a>} />
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <nav className="card flex flex-col self-start p-1.5" aria-label="Rapports">
          {(Object.keys(REPORTS) as ReportType[]).map((k) => (
            <Link key={k} href={`/admin/analytics/reports?${new URLSearchParams({ type: k, from: range.fromStr, to: range.toStr })}`} aria-current={k === type ? "page" : undefined} className={cx("rounded-lg px-3 py-2", k === type ? "bg-[#f3f0ff] text-[#5b21b6]" : "hover:bg-[#f7f7f7]")}>
              <div className="text-[13px] font-[650]">{REPORTS[k].title}</div>
              <div className="text-xs text-muted">{REPORTS[k].text}</div>
            </Link>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-3">
          <form className="card flex flex-wrap items-end gap-2 p-3">
            <input type="hidden" name="type" value={type} />
            <label className="label">Du<input type="date" name="from" defaultValue={range.fromStr} className="input" /></label>
            <label className="label">Au<input type="date" name="to" defaultValue={range.toStr} className="input" /></label>
            <button className="btn">Afficher</button>
            <div className="ml-auto flex flex-wrap gap-1">
              {presets.map((p) => <Link key={p.label} href={`/admin/analytics/reports?${qs({ from: p.from, to: p.to })}`} className={cx("btn btn-sm", p.from === range.fromStr && p.to === range.toStr && "bg-[#e3e3e3]")}>{p.label}</Link>)}
            </div>
          </form>
          <section className="card overflow-hidden">
            <div className="card-h"><h2 className="text-sm font-[650]">{REPORTS[type].title}</h2><span className="text-xs text-muted">{range.fromStr.split("-").reverse().join("/")} → {range.toStr.split("-").reverse().join("/")}</span></div>
            {report.rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead><tr>{report.columns.map((c, i) => <th key={c.label} className={cx("th", (c.money || c.num || i > 0 && typeof report.rows[0][i] === "number") && "text-right")}>{c.label}</th>)}</tr></thead>
                  <tbody>
                    {report.rows.map((r, i) => (
                      <tr key={i} className="hover:bg-[#f7f7f7]">{r.map((v, j) => <td key={j} className={cx("td", typeof v === "number" ? "num text-right" : j === 0 && "font-[550]")}>{show(v, j)}</td>)}</tr>
                    ))}
                  </tbody>
                  {report.totals && <tfoot><tr className="border-t-2 border-line bg-[#fafafa]">{report.totals.map((v, j) => <td key={j} className={cx("td font-[650]", typeof v === "number" && "num text-right")}>{show(v, j)}</td>)}</tr></tfoot>}
                </table>
              </div>
            ) : (
              <p className="px-4 py-10 text-center text-muted">Aucune vente sur cette période.</p>
            )}
          </section>
          {type === "taxes" && <p className="px-1 text-xs text-muted">Calcul indicatif à partir des montants TTC encaissés : faites-le valider par votre comptable. Les cartes cadeaux vendues ne sont pas soumises à la TVA à la vente (elles le sont quand elles sont utilisées).</p>}
        </div>
      </div>
    </>
  );
}
