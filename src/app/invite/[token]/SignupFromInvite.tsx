"use client";

import { useActionState } from "react";
import { signupFromInvite } from "./actions";
import { keepOnSubmit } from "@/lib/keep-form";

export function SignupFromInvite({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(signupFromInvite, undefined);
  return (
    <form onSubmit={keepOnSubmit(action)} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <label className="label">E-mail<input className="input bg-[#f7f7f7]" value={email} readOnly /></label>
      <label className="label">Votre nom<input id="inv-name" name="name" required autoComplete="name" className="input" /></label>
      <label className="label">Mot de passe<span className="hint">8 caractères minimum.</span><input id="inv-password" name="password" type="password" required minLength={8} autoComplete="new-password" className="input" /></label>
      {state?.error && <p role="alert" className="text-[13px] text-[#8e0b21]">{state.error}</p>}
      <button className="btn btn-primary h-9" disabled={pending}>{pending ? "Création…" : "Créer mon compte et rejoindre"}</button>
    </form>
  );
}
