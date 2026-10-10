"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { verifyTwoFactor } from "../../actions";

export default function TwoFactorForm() {
  const [state, action, pending] = useActionState(verifyTwoFactor, undefined);
  const [recovery, setRecovery] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Code de vérification</h1>
        <p className="mt-1 text-sm text-muted">{recovery ? "Saisissez l'un de vos codes de secours (chacun ne sert qu'une fois)." : "Ouvrez votre application d'authentification et saisissez le code à 6 chiffres."}</p>
      </div>
      {recovery
        ? <label className="label">Code de secours<input key="r" name="code" required autoComplete="off" placeholder="abcde-12345" className="input font-mono" autoFocus /></label>
        : <label className="label">Code à 6 chiffres<input key="t" name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} placeholder="123456" className="input text-center font-mono text-xl tracking-[0.4em]" autoFocus /></label>}
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button className="btn btn-primary py-2.5" disabled={pending}>{pending ? "Vérification…" : "Vérifier"}</button>
      <div className="flex justify-between text-sm">
        <button type="button" onClick={() => setRecovery(!recovery)} className="text-pine hover:underline">{recovery ? "Utiliser l'application" : "Utiliser un code de secours"}</button>
        <Link href="/login" className="text-muted hover:underline">Annuler</Link>
      </div>
    </form>
  );
}
