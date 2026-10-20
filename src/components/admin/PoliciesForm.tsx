"use client";

import { useActionState, useState } from "react";
import { savePolicies } from "@/app/admin/settings/policies/actions";
import { keepOnSubmit } from "@/lib/keep-form";
import { POLICY_KEYS, POLICY_LABELS, type Policies, type PolicyKey } from "@/lib/checkout-settings";

/** Les 7 politiques : texte, publication et bouton « Créer à partir d'un modèle ». */
export function PoliciesForm({ policies, templates, base }: { policies: Policies; templates: Record<PolicyKey, string>; base: string }) {
  const [state, action, pending] = useActionState(savePolicies, undefined);
  const [bodies, setBodies] = useState<Record<PolicyKey, string>>(() => Object.fromEntries(POLICY_KEYS.map((k) => [k, policies[k].body])) as Record<PolicyKey, string>);
  const fill = (k: PolicyKey) => {
    if (bodies[k].trim() && !confirm("Remplacer le texte actuel par le modèle ?")) return;
    setBodies((b) => ({ ...b, [k]: templates[k] }));
  };
  return (
    <form onSubmit={keepOnSubmit(action)} className="flex flex-col gap-4">
      {POLICY_KEYS.map((k) => (
        <section key={k} id={k} className="card flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-[650]">{POLICY_LABELS[k].fr}</h2>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name={`${k}_published`} defaultChecked={policies[k].published} className="h-4 w-4 accent-[#7c3aed]" />Publié</label>
          </div>
          <textarea name={`${k}_body`} value={bodies[k]} onChange={(e) => setBodies((b) => ({ ...b, [k]: e.target.value }))} rows={bodies[k] ? 12 : 4} maxLength={50_000} placeholder="Rédigez votre politique, ou partez d'un modèle." className="input font-mono text-xs leading-relaxed" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-sm" onClick={() => fill(k)}>Créer à partir d'un modèle</button>
            {policies[k].published && <a href={`${base}/policies/${k}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm">Voir sur la boutique</a>}
            <span className="text-xs text-muted">Mise en forme : « ## Titre », « - liste », **gras**. Les modèles sont génériques et ne constituent pas un conseil juridique.</span>
          </div>
        </section>
      ))}
      {state?.error && <p role="alert" className="text-[13px] text-[#8e0b21]">{state.error}</p>}
      {state?.ok && <p role="status" className="text-[13px] text-[#0c5132]">Politiques enregistrées.</p>}
      <button className="btn btn-primary self-end" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
    </form>
  );
}
