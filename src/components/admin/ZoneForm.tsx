"use client";

import { useActionState, useEffect, useState } from "react";
import { saveZone } from "@/app/admin/settings/shipping/actions";
import { COUNTRIES } from "@/lib/countries";

export function ZoneForm({ zone, onDone }: { zone?: { id: string; name: string; countries: string[] }; onDone?: () => void }) {
  const [state, action, pending] = useActionState(saveZone, undefined);
  const [open, setOpen] = useState(Boolean(zone));
  useEffect(() => { if (state?.ok) { setOpen(Boolean(zone)); onDone?.(); } }, [state, zone, onDone]);
  if (!open) return <button type="button" className="btn self-start" onClick={() => setOpen(true)}>Créer une zone</button>;
  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-line p-3">
      {zone && <input type="hidden" name="id" value={zone.id} />}
      <label className="label">Nom de la zone<input name="name" required maxLength={60} defaultValue={zone?.name} placeholder="Ex. Europe" className="input" /></label>
      <fieldset>
        <legend className="mb-1.5 text-[13px]">Pays</legend>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {COUNTRIES.map((c) => (
            <label key={c} className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="countries" value={c} defaultChecked={zone?.countries.includes(c)} className="h-4 w-4 accent-[#303030]" />{c}</label>
          ))}
        </div>
      </fieldset>
      {state?.error && <p role="alert" className="text-[13px] text-[#8e0b21]">{state.error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer la zone"}</button>
        {!zone && <button type="button" className="btn" onClick={() => setOpen(false)}>Annuler</button>}
      </div>
    </form>
  );
}
