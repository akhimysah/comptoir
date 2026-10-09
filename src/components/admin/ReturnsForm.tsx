"use client";

import { useActionState } from "react";
import { saveReturns } from "@/app/admin/settings/actions";

export function ReturnsForm(p: { enabled: boolean; days: number; instructions: string }) {
  const [state, action, pending] = useActionState(saveReturns, undefined);
  return (
    <form action={action} id="retours" className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-[650]">Retours</h2>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="enabled" defaultChecked={p.enabled} className="h-4 w-4 accent-[#7c3aed]" />Retours en ligne</label>
      </div>
      <p className="text-xs text-muted">Vos clients demandent un retour depuis « Mon compte ». Vous acceptez ou refusez, puis remboursez à la réception du colis.</p>
      <label className="label">Délai de retour (jours après l'expédition)<input name="days" type="number" min={1} max={365} defaultValue={p.days} className="input num w-28" /></label>
      <label className="label">Instructions de retour<span className="hint">Envoyées au client quand vous acceptez : adresse, emballage, étiquette…</span>
        <textarea name="instructions" rows={4} maxLength={2000} defaultValue={p.instructions} placeholder={"Renvoyez les articles non portés, dans leur emballage, à :\nAtelier Argile – Retours\n12 rue des Potiers, 69001 Lyon"} className="input" />
      </label>
      {state?.error && <p role="alert" className="text-[13px] text-[#8e0b21]">{state.error}</p>}
      {state?.ok && <p role="status" className="text-[13px] text-[#0c5132]">Enregistré.</p>}
      <button className="btn btn-primary self-end" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
    </form>
  );
}
