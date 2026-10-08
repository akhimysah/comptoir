"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createGiftCard } from "@/app/admin/gift-cards/actions";

export function GiftCardForm({ currency }: { currency: string }) {
  const [state, action, pending] = useActionState(createGiftCard, undefined);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.code) { ref.current?.reset(); setCopied(false); } }, [state]);
  const pretty = state?.code?.match(/.{1,4}/g)?.join(" ");
  return (
    <form ref={ref} action={action} className="card flex flex-col gap-3 p-4">
      <h2 className="text-sm font-[650]">Créer une carte cadeau</h2>
      <label className="label">Montant ({currency})<input id="gc-amount" name="amount" required inputMode="decimal" placeholder="50,00" className="input num" /></label>
      <label className="label">Envoyer à (optionnel)<span className="hint">Le code part par e-mail à cette adresse.</span><input id="gc-email" name="email" type="email" className="input" placeholder="client@exemple.fr" /></label>
      <label className="label">Message (optionnel)<textarea id="gc-note" name="note" maxLength={300} className="input min-h-[60px]" placeholder="Joyeux anniversaire !" /></label>
      <label className="label">Date d'expiration (optionnel)<input id="gc-expires" name="expiresAt" type="date" className="input" /></label>
      {state?.error && <p role="alert" className="text-[13px] text-[#8e0b21]">{state.error}</p>}
      {pretty && (
        <div role="status" className="flex flex-col gap-2 rounded-lg bg-[#f1f1f1] p-3">
          <span className="text-[13px]">Carte créée{state?.emailed ? `, envoyée à ${state.emailed}` : ""}. Notez le code, il ne sera plus affiché en entier :</span>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-white px-3 py-2 text-center font-mono text-base font-bold tracking-widest">{pretty}</code>
            <button type="button" className="btn" onClick={() => navigator.clipboard.writeText(state!.code!).then(() => setCopied(true), () => {})}>{copied ? "Copié" : "Copier"}</button>
          </div>
        </div>
      )}
      <button className="btn btn-primary self-start" disabled={pending}>{pending ? "Création…" : "Créer la carte"}</button>
    </form>
  );
}
