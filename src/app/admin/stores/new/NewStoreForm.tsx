"use client";

import { useActionState } from "react";
import { createAnotherStore } from "./actions";

export function NewStoreForm() {
  const [state, action, pending] = useActionState(createAnotherStore, undefined);
  return (
    <form action={action} className="card flex max-w-lg flex-col gap-3 p-4">
      <label className="label">Nom de la boutique<input id="store-name" name="name" required maxLength={60} className="input" placeholder="Ex. Atelier Argile Belgique" /></label>
      <label className="label">Devise
        <select id="store-currency" name="currency" defaultValue="EUR" className="input">
          {["EUR", "USD", "GBP", "CHF", "CAD", "MAD"].map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      {state?.error && <p role="alert" className="text-[13px] text-[#8e0b21]">{state.error}</p>}
      <button className="btn btn-primary self-start" disabled={pending}>{pending ? "Création…" : "Créer la boutique"}</button>
    </form>
  );
}
