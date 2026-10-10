"use client";

import { useActionState, useState } from "react";
import { saveCurrencies } from "@/app/admin/settings/actions";
import { keepOnSubmit } from "@/lib/keep-form";

const CHOICES = ["USD", "GBP", "CHF", "CAD", "JPY", "MAD", "XOF", "DZD", "TND", "AED", "SAR", "EUR"];

export function CurrenciesForm({ base, current }: { base: string; current: { code: string; rate: number }[] }) {
  const [state, action, pending] = useActionState(saveCurrencies, undefined);
  const [on, setOn] = useState<string[]>(current.map((c) => c.code));
  return (
    <form onSubmit={keepOnSubmit(action)} className="card flex flex-col gap-3 p-4">
      <h2 className="text-sm font-[650]">Devises affichées</h2>
      <p className="text-xs text-muted">Vos clients choisissent une devise dans le menu de la boutique et voient les prix convertis. Le paiement reste en {base}.</p>
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
      {state?.error && <p role="alert" className="text-[13px] text-[#8e0b21]">{state.error}</p>}
      {state?.ok && <p role="status" className="text-[13px] text-[#0c5132]">{state.ok}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={pending}>Enregistrer</button>
        <button name="auto" value="1" className="btn" disabled={pending || !on.length}>{pending ? "…" : "Utiliser les taux du jour"}</button>
      </div>
    </form>
  );
}
