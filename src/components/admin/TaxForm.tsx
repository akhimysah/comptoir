"use client";

import { useActionState } from "react";
import { saveTaxes } from "@/app/admin/settings/actions";
import { TAX_RATES } from "@/lib/tax";
import { keepOnSubmit } from "@/lib/keep-form";

export function TaxForm(p: { taxRateBps: number; vatByCountry: boolean; legalName: string; legalAddress: string; siret: string; vatNumber: string }) {
  const [state, action, pending] = useActionState(saveTaxes, undefined);
  return (
    <form onSubmit={keepOnSubmit(action)} className="card flex flex-col gap-3 p-4">
      <h2 className="text-sm font-[650]">Taxes et mentions légales</h2>
      <label className="label">TVA (incluse dans vos prix)
        <select name="taxRateBps" defaultValue={p.taxRateBps} className="input">
          {TAX_RATES.map((r) => <option key={r.bps} value={r.bps}>{r.label}</option>)}
        </select>
      </label>
      <label className="flex items-start gap-2 text-[13px]">
        <input type="checkbox" name="vatByCountry" defaultChecked={p.vatByCountry} className="mt-0.5 h-4 w-4 shrink-0 accent-[#7c3aed]" />
        <span>TVA selon le pays de livraison <span className="block text-xs text-muted">Pour les ventes à distance dans l'UE au-delà de 10 000 € par an (guichet unique OSS) : taux normal du pays du client, 0 % pour les livraisons hors UE (export). Vos prix TTC ne changent pas. Nécessite le taux normal de 20 %.</span></span>
      </label>
      <p className="text-xs text-muted">Les prix affichés sont TTC. La TVA est indiquée dans le panier, sur les commandes et sur les factures. En franchise, la mention « TVA non applicable, article 293 B du CGI » est ajoutée aux factures.</p>
      <label className="label">Raison sociale<input name="legalName" defaultValue={p.legalName} maxLength={120} className="input" placeholder="Ex. Atelier Argile SAS" /></label>
      <label className="label">Adresse du siège<textarea name="legalAddress" defaultValue={p.legalAddress} maxLength={300} className="input min-h-[60px]" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="label">SIRET<input name="siret" defaultValue={p.siret} maxLength={20} className="input" /></label>
        <label className="label">N° de TVA intracom.<input name="vatNumber" defaultValue={p.vatNumber} maxLength={20} className="input" placeholder="FR…" /></label>
      </div>
      {state?.error && <p role="alert" className="text-[13px] text-[#8e0b21]">{state.error}</p>}
      {state?.ok && <p role="status" className="text-[13px] text-[#0c5132]">Enregistré.</p>}
      <button className="btn btn-primary self-end" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
    </form>
  );
}
