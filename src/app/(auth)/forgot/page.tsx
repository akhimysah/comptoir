"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestReset } from "../password-actions";
import { keepOnSubmit } from "@/lib/keep-form";

export default function ForgotPage() {
  const [state, action, pending] = useActionState(requestReset, undefined);
  if (state?.sent) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">Vérifiez vos e-mails</h1>
        <p className="text-muted">Si un compte existe avec cette adresse, vous allez recevoir un lien pour choisir un nouveau mot de passe. Il est valable 1 heure.</p>
        <Link href="/login" className="btn">Retour à la connexion</Link>
      </div>
    );
  }
  return (
    <form onSubmit={keepOnSubmit(action)} className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">Mot de passe oublié</h1>
        <p className="mt-1 text-muted">Indiquez l'e-mail de votre compte, nous vous enverrons un lien.</p>
      </div>
      <label className="label">E-mail<input id="forgot-email" name="email" type="email" required autoComplete="email" className="input" /></label>
      {state?.error && <p role="alert" className="text-[13px] text-[#8e0b21]">{state.error}</p>}
      <button className="btn btn-primary h-9" disabled={pending}>{pending ? "Envoi…" : "Recevoir le lien"}</button>
      <Link href="/login" className="text-center text-[13px] text-pine hover:underline">Retour à la connexion</Link>
    </form>
  );
}
