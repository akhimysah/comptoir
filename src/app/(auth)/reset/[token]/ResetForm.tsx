"use client";

import { useActionState } from "react";
import { resetPassword } from "../../password-actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <h1 className="text-xl font-bold">Nouveau mot de passe</h1>
      <label className="label">Nouveau mot de passe<span className="hint">8 caractères minimum.</span><input id="reset-password" name="password" type="password" required minLength={8} autoComplete="new-password" className="input" /></label>
      <label className="label">Confirmer<input id="reset-confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" className="input" /></label>
      {state?.error && <p role="alert" className="text-[13px] text-[#8e0b21]">{state.error}</p>}
      <button className="btn btn-primary h-9" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer et me connecter"}</button>
    </form>
  );
}
