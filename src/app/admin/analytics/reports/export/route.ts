import { requirePerm } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { centsToInput } from "@/lib/money";
import { buildReport, parseRange, REPORTS, type ReportType } from "@/lib/sales-reports";

/** Export CSV (Excel) du rapport affiché, mêmes chiffres que la page. */
export async function GET(req: Request) {
  const { store } = await requirePerm("analytics");
  const sp = new URL(req.url).searchParams;
  const type = (sp.get("type") ?? "daily") as ReportType;
  if (!(type in REPORTS)) return new Response("Rapport inconnu", { status: 400 });
  const range = parseRange(sp.get("from") ?? undefined, sp.get("to") ?? undefined);
  const r = await buildReport(store, type, range.from, range.to);
  const cell = (v: string | number, i: number) => (typeof v === "number" && r.columns[i]?.money ? centsToInput(v).replace(".", ",") : v);
  const rows = [r.columns.map((c) => c.label), ...r.rows.map((row) => row.map(cell)), ...(r.totals ? [r.totals.map(cell)] : [])];
  return csvResponse(toCsv(rows), `${type}-${store.slug}-${range.fromStr}-${range.toStr}.csv`);
}
