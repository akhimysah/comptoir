"use client";

import { useActionState, useEffect, useRef } from "react";
import { addRedirect } from "@/app/admin/navigation/actions";

export function RedirectForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(addRedirect, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2 border-b border-line px-4 py-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end">
        <label className="label">Ancienne adresse<span className="hint">/s/{slug}…</span><input name="from" required maxLength={300} placeholder="/ancienne-page" className="input" /></label>
        <span className="hidden pb-2 text-muted sm:block" aria-hidden>→</span>
        <label className="label">Rediriger vers<span className="hint">Chemin ou adresse https://</span><input name="to" required maxLength={500} placeholder="/c/bols" className="input" /></label>
        <button className="btn btn-primary" disabled={pending}>{pending ? "Ajout…" : "Ajouter"}</button>
      </div>
      {state?.error && <p role="alert" className="text-[13px] text-[#8e0b21]">{state.error}</p>}
      {state?.ok && <p role="status" className="text-[13px] text-[#0c5132]">Redirection ajoutée.</p>}
    </form>
  );
}
