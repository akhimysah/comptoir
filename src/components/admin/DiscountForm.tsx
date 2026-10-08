"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createDiscount } from "@/app/admin/discounts/actions";

export function DiscountForm({ currency }: { currency: string }) {
  const [state, action, pending] = useActionState(createDiscount, undefined);
  const [type, setType] = useState<"percent" | "fixed">("percent");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="card flex flex-col gap-4 p-5">
      <h2 className="text-base font-bold">Nouveau code promo</h2>
      <label className="label">Code<input id="d-code" name="code" required className="input font-mono uppercase" placeholder="BIENVENUE10" maxLength={30} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="label">Type
          <select id="d-type" name="type" className="input" value={type} onChange={(e) => setType(e.target.value as "percent" | "fixed")}>
            <option value="percent">Pourcentage</option>
            <option value="fixed">Montant fixe</option>
          </select>
        </label>
        <label className="label">{type === "percent" ? "Réduction (%)" : `Réduction (${currency})`}<input id="d-value" name="value" required className="input num" inputMode="decimal" placeholder={type === "percent" ? "10" : "5,00"} /></label>
      </div>
      <label className="label">Montant minimum du panier<span className="hint">Optionnel.</span><input id="d-min" name="minSubtotal" className="input num" inputMode="decimal" placeholder="0,00" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="label">Utilisations max<input id="d-limit" name="usageLimit" type="number" min={1} className="input num" placeholder="Illimité" /></label>
        <label className="label">Fin de validité<input id="d-ends" name="endsAt" type="date" className="input" /></label>
      </div>
      {state?.error && <p role="alert" className="text-sm font-semibold text-red-700">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm font-semibold text-pine">Code créé.</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Création…" : "Créer le code"}</button>
    </form>
  );
}
