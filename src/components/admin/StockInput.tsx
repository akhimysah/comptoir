"use client";

import { useState, useTransition } from "react";
import { setStock } from "@/app/admin/inventory/actions";

/** Champ « Disponible » modifiable sur place ; le bouton Enregistrer apparaît quand la valeur change. */
export function StockInput({ variantId, initial, label }: { variantId: string; initial: number; label: string }) {
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState(String(initial));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = Math.floor(Number(value));
  const dirty = value !== "" && n !== saved;
  const save = () =>
    start(async () => {
      const res = await setStock(variantId, n);
      if (res.error) setError(res.error);
      else { setSaved(n); setError(null); }
    });
  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-[#8e0b21]">{error}</span>}
      <input
        aria-label={`Disponible : ${label}`}
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && dirty) { e.preventDefault(); save(); } }}
        className="input num w-24 text-right"
      />
      <button type="button" onClick={save} disabled={!dirty || pending} className={dirty ? "btn btn-primary btn-sm" : "btn btn-sm invisible"}>{pending ? "…" : "Enregistrer"}</button>
    </div>
  );
}
