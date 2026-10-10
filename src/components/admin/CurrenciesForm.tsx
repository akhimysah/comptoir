"use client";

import { useActionState, useState } from "react";
import { saveCurrencies } from "@/app/admin/settings/actions";
import { keepOnSubmit } from "@/lib/keep-form";

const CHOICES = ["USD", "GBP", "CHF", "CAD", "JPY", "MAD", "XOF", "DZD", "TND", "AED", "SAR", "EUR"];

export function CurrenciesForm({ base, current, charge }: { base: string; current: { code: string; rate: number }[]; charge: boolean }) {
  const [state, action, pending] = useActionState(saveCurrencies, undefined);
  const [on, setOn] = useState<string[]>(current.map((c) => c.code));
  return (
    <form onSubmit={keepOnSubmit(action)} className="card flex flex-col gap-3 p-4">
      <h2 className="text-sm font-[650]">Devises affichées</h2>
      <p className="text-xs text-muted">Vos clients choisissent une devise dans le menu de la boutique et voient les prix convertis.</p>
      <div className="flex flex-col gap-1.5">
        {CHOICES.filter((c) => c !== base).map((code) => {
          const cur = current.find((c) => c.code === code);
          const checked = on.includes(code);
          return (
            <div key={code} className="flex items-center gap-3">
              <label className="flex w-20 items-center gap-2 text-[13px]"><input type="checkbox" name="code" value={code} checked={checked} onChange={(e) => setOn((xs) => (e.target.checked ? [...xs, code] : xs.filter((x) => x !== code)))} className="h-4 w-4 accent-[#7c3aed]" />{code}</label>
              {checked && <label className="flex items-center gap-2 text-xs text-muted">1 {base} =<input name={`rate_${code}`} defaultValue={cur?.rate ?? ""} inputMode="decimal" className="input num h-7 w-24 py-1" aria-label={`Taux ${code}`} />{code}</label>}
            </div>
          );
        })}
      </div>
      <label className="flex items-start gap-2 border-t border-line pt-3 text-[13px]">
        <input type="checkbox" name="charge" defaultChecked={charge} className="mt-0.5 h-4 w-4 accent-[#7c3aed]" />
        <span>Encaisser dans la devise du client<span className="block text-xs text-muted">Paiement par carte dans la devise choisie, au taux ci-dessus (USD, GBP, CHF, CAD, MAD, DZD, AED, SAR). Sinon, les prix sont indicatifs et le paiement se fait en {base}. Vos rapports restent en {base}.</span></span>
      </label>
      {state?.error && <p role="alert" className="text-[13px] text-[#8e0b21]">{state.error}</p>}
      {state?.ok && <p role="status" className="text-[13px] text-[#0c5132]">{state.ok}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={pending}>Enregistrer</button>
        <button name="auto" value="1" className="btn" disabled={pending || !on.length}>{pending ? "…" : "Utiliser les taux du jour"}</button>
      </div>
    </form>
  );
}
