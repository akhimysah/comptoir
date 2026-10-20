"use client";

import { useActionState, useState } from "react";
import { saveOrderSettings } from "@/app/admin/settings/actions";
import { keepOnSubmit } from "@/lib/keep-form";

/** Numéro de commande (préfixe, suffixe, exemple en direct), archivage automatique et délai de traitement. */
export function OrderSettingsForm(p: { prefix: string; suffix: string; autoArchive: boolean; fulfillmentDays: number; nextNumber: number }) {
  const [state, action, pending] = useActionState(saveOrderSettings, undefined);
  const [prefix, setPrefix] = useState(p.prefix);
  const [suffix, setSuffix] = useState(p.suffix);
  return (
    <form onSubmit={keepOnSubmit(action)} id="commandes" className="card flex flex-col gap-3 p-4">
      <h2 className="text-sm font-[650]">Commandes</h2>
      <p className="text-xs text-muted">Le numéro de commande est attribué dans l'ordre, sans trou. Le préfixe et le suffixe s'affichent devant et derrière, sur la boutique, les e-mails et les factures.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="label">Préfixe<input name="orderPrefix" value={prefix} maxLength={10} onChange={(e) => setPrefix(e.target.value)} className="input" /></label>
        <label className="label">Suffixe<input name="orderSuffix" value={suffix} maxLength={10} onChange={(e) => setSuffix(e.target.value)} className="input" /></label>
      </div>
      <p className="text-[13px]">Votre prochaine commande portera le numéro <b className="num">{prefix}{p.nextNumber}{suffix}</b>.</p>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="autoArchive" defaultChecked={p.autoArchive} className="h-4 w-4 accent-[#7c3aed]" />Archiver automatiquement les commandes une fois payées et expédiées</label>
      <label className="label">Délai de traitement (jours ouvrés)<span className="hint">Temps promis entre la commande et l'expédition : « Traiter avant le … » sur vos commandes, et inclus dans la livraison estimée.</span><input name="fulfillmentDays" type="number" min={0} max={60} defaultValue={p.fulfillmentDays} className="input num w-28" /></label>
      {state?.error && <p role="alert" className="text-[13px] text-[#8e0b21]">{state.error}</p>}
      {state?.ok && <p role="status" className="text-[13px] text-[#0c5132]">Enregistré.</p>}
      <button className="btn btn-primary self-end" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
    </form>
  );
}
