import { RISK_LABELS, type RiskLevel } from "@/lib/risk";

const COLORS: Record<RiskLevel, string> = { low: "bg-[#29845a]", medium: "bg-[#ffb800]", high: "bg-[#e51c00]" };
const ORDER: RiskLevel[] = ["low", "medium", "high"];

/** Carte « Analyse du risque » (fiche commande) : niveau sur une jauge à trois crans et indices expliqués. */
export function OrderRiskCard({ level, notes }: { level: RiskLevel; notes: string[] }) {
  const idx = ORDER.indexOf(level);
  return (
    <section className="card flex flex-col gap-3 p-4">
      <h2 className="text-sm font-[650]">Analyse du risque</h2>
      <p className="text-[13px]">Le risque pour cette commande est <b>{RISK_LABELS[level]}</b>.</p>
      <div className="flex gap-1" role="meter" aria-valuemin={0} aria-valuemax={2} aria-valuenow={idx} aria-label={`Risque ${RISK_LABELS[level]}`}>
        {ORDER.map((l, i) => <span key={l} className={`h-1.5 flex-1 rounded-full ${i <= idx ? COLORS[level] : "bg-[#e3e3e3]"}`} />)}
      </div>
      <div className="flex justify-between text-[11px] text-muted"><span>Faible</span><span>Moyen</span><span>Élevé</span></div>
      <ul className="flex flex-col gap-1.5 text-[13px]">
        {notes.map((n, i) => (
          <li key={i} className="flex gap-2">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.startsWith("Aucun") || n.startsWith("Paiement") || n.startsWith("Client connu") ? "bg-[#29845a]" : "bg-[#ffb800]"}`} />
            <span>{n}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
