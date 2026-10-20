import type { storeVitals } from "@/lib/vitals";

type V = Awaited<ReturnType<typeof storeVitals>>;
const LABEL = { good: ["Bon", "bg-[#cdfee1] text-[#0c5132]"], needs: ["À améliorer", "bg-[#ffeb78] text-[#4f4700]"], poor: ["Mauvais", "bg-[#fedad9] text-[#8e0b21]"] } as const;
const ms = (v: number | null) => (v === null ? "—" : v >= 1000 ? `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} s` : `${Math.round(v)} ms`);

function Metric({ name, title, value, rating, delta, hint }: { name: string; title: string; value: string; rating: "good" | "needs" | "poor" | null; delta: number | null; hint: string }) {
  return (
    <div className="flex shrink-0 flex-col gap-1 px-5 py-3" title={hint}>
      <span className="whitespace-nowrap text-[13px] font-[550] underline decoration-dotted underline-offset-4">{title}</span>
      <span className="flex items-center gap-2 whitespace-nowrap text-[13px]">
        <span className="font-[650]">{value}</span>
        {delta !== null && delta !== 0 && <span className="text-xs text-muted">{delta < 0 ? "↘" : "↗"} {Math.abs(delta)} %</span>}
        {rating && <span className={`rounded-full px-2 py-0.5 text-xs font-[550] ${LABEL[rating][1]}`}>● {LABEL[rating][0]}</span>}
        {!rating && <span className="text-xs text-muted">{name === "visits" ? "" : "pas encore de mesure"}</span>}
      </span>
    </div>
  );
}

/** Barre de performance (comme celle de Shopify) : Core Web Vitals des visiteurs sur 30 jours et visites. */
export function VitalsBar({ v }: { v: V }) {
  const max = Math.max(1, ...v.perDay);
  const points = v.perDay.map((n, i) => `${(i / Math.max(1, v.perDay.length - 1)) * 100},${28 - (n / max) * 24}`).join(" ");
  const visitsDelta = v.previousVisits ? Math.round(((v.visits - v.previousVisits) / v.previousVisits) * 100) : null;
  return (
    <div className="card flex divide-x divide-line overflow-x-auto">
      <div className="flex shrink-0 items-center gap-2 px-5 py-3 text-[13px] whitespace-nowrap"><svg viewBox="0 0 20 20" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden><rect x="3" y="4" width="14" height="13" rx="2" /><path d="M3 8h14M7 2v4M13 2v4" /></svg>{v.days} jours</div>
      <Metric name="lcp" title="LCP P75" value={ms(v.lcp.value)} rating={v.lcp.rating} delta={v.lcp.delta} hint="Largest Contentful Paint : temps d'affichage du plus grand élément visible (75 % des visites font mieux)." />
      <Metric name="inp" title="INP P75" value={ms(v.inp.value)} rating={v.inp.rating} delta={v.inp.delta} hint="Interaction to Next Paint : réactivité aux clics et saisies." />
      <Metric name="cls" title="Cumulative Layout Shift" value={v.cls.value === null ? "—" : v.cls.value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} rating={v.cls.rating} delta={v.cls.delta} hint="Stabilité visuelle : éléments qui bougent pendant le chargement." />
      <div className="flex shrink-0 items-center gap-4 px-5 py-3">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-[550] underline decoration-dotted underline-offset-4">Visites</span>
          <span className="flex items-center gap-2 whitespace-nowrap text-[13px]"><span className="font-[650]">{v.visits.toLocaleString("fr-FR")}</span>{visitsDelta !== null && visitsDelta !== 0 && <span className="text-xs text-muted">{visitsDelta < 0 ? "↘" : "↗"} {Math.abs(visitsDelta)} %</span>}</span>
        </div>
        <svg viewBox="0 0 100 30" className="h-8 w-24 shrink-0 text-[#2c6ecb]" preserveAspectRatio="none" aria-hidden><polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" /></svg>
      </div>
    </div>
  );
}
