"use client";

import { useActionState } from "react";
import { saveSettings } from "@/app/admin/settings/actions";

type Props = { name: string; tagline: string; currency: string; shipping: string; freeFrom: string };

export function SettingsForm(p: Props) {
  const [state, action, pending] = useActionState(saveSettings, undefined);
  return (
    <form action={action} className="card flex flex-col gap-4 p-5">
      <h2 className="text-base font-bold">Boutique</h2>
      <label className="label">Nom<input id="s-name" name="name" required maxLength={60} defaultValue={p.name} className="input" /></label>
      <label className="label">Description courte<span className="hint">Utilisée par les moteurs de recherche et dans le pied de page.</span><textarea id="s-tagline" name="tagline" maxLength={200} defaultValue={p.tagline} className="input min-h-[70px]" /></label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="label">Devise
          <select id="s-currency" name="currency" defaultValue={p.currency} className="input">
            {["EUR", "USD", "GBP", "CHF", "CAD", "MAD"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="label">Frais de livraison<input id="s-shipping" name="shipping" inputMode="decimal" defaultValue={p.shipping} className="input num" /></label>
        <label className="label">Livraison offerte dès<input id="s-free" name="freeFrom" inputMode="decimal" defaultValue={p.freeFrom} className="input num" /></label>
      </div>
      <p className="text-xs text-muted">Mettez 0 dans « Livraison offerte dès » pour toujours l'offrir.</p>
      {state?.error && <p role="alert" className="text-sm font-semibold text-red-700">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm font-semibold text-pine">Réglages enregistrés.</p>}
      <div className="flex justify-end"><button className="btn btn-primary" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</button></div>
    </form>
  );
}
