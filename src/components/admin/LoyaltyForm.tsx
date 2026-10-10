"use client";

import { useActionState } from "react";
import { saveLoyalty } from "@/app/admin/settings/actions";
import { keepOnSubmit } from "@/lib/keep-form";

export function LoyaltyForm(p: { enabled: boolean; perUnit: number; rewardPoints: number; rewardValue: string; currency: string }) {
  const [state, action, pending] = useActionState(saveLoyalty, undefined);
  return (
    <form onSubmit={keepOnSubmit(action)} className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-[650]">Programme de fidélité</h2>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="enabled" defaultChecked={p.enabled} className="h-4 w-4 accent-[#7c3aed]" />Activé</label>
      </div>
      <p className="text-xs text-muted">Vos clients gagnent des points à chaque achat et les échangent contre un bon de réduction depuis « Mon compte ».</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="label">Points par {p.currency} dépensé<input name="perUnit" type="number" min={1} max={100} defaultValue={p.perUnit} className="input num" /></label>
        <label className="label">Points pour un bon<input name="rewardPoints" type="number" min={1} defaultValue={p.rewardPoints} className="input num" /></label>
        <label className="label">Valeur du bon ({p.currency})<input name="rewardValue" inputMode="decimal" defaultValue={p.rewardValue} className="input num" /></label>
      </div>
      {state?.error && <p role="alert" className="text-[13px] text-[#8e0b21]">{state.error}</p>}
      {state?.ok && <p role="status" className="text-[13px] text-[#0c5132]">Enregistré.</p>}
      <button className="btn btn-primary self-end" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
    </form>
  );
}
