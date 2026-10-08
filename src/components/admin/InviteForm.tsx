"use client";

import { useActionState, useState } from "react";
import { inviteMember } from "@/app/admin/settings/users/actions";

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMember, undefined);
  const [copied, setCopied] = useState(false);
  return (
    <form action={action} className="card flex flex-col gap-3 p-4">
      <h2 className="text-sm font-[650]">Ajouter un collaborateur</h2>
      <div className="flex gap-2">
        <input id="invite-email" name="email" type="email" required placeholder="E-mail du collaborateur" className="input" aria-label="E-mail du collaborateur" />
        <button className="btn btn-primary" disabled={pending}>{pending ? "Création…" : "Créer l'invitation"}</button>
      </div>
      {state?.error && <p role="alert" className="text-[13px] text-[#8e0b21]">{state.error}</p>}
      {state?.link && (
        <div className="flex flex-col gap-2 rounded-lg bg-[#f1f1f1] p-3">
          <p className="text-[13px]">Envoyez ce lien à <b>{state.email}</b>. Il est valable 7 jours et ne sera plus affiché ensuite.</p>
          <div className="flex gap-2">
            <input readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} className="input font-mono text-xs" aria-label="Lien d'invitation" />
            <button
              type="button"
              className="btn"
              onClick={() => navigator.clipboard.writeText(state.link!).then(() => setCopied(true), () => setCopied(false))}
            >
              {copied ? "Copié" : "Copier"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
