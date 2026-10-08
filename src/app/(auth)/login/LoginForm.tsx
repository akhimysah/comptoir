"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "../actions";

export default function LoginForm({ next, email }: { next?: string; email?: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <h1 className="text-2xl font-bold">Se connecter</h1>
        <p className="mt-1 text-sm text-muted">Accédez à l'admin de votre boutique.</p>
      </div>
      <label className="label">E-mail<input id="email" name="email" type="email" required autoComplete="email" defaultValue={email} className="input" /></label>
      <label className="label"><span className="flex justify-between">Mot de passe<Link href="/forgot" className="text-pine hover:underline">Mot de passe oublié ?</Link></span><input id="password" name="password" type="password" required autoComplete="current-password" className="input" /></label>
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button className="btn btn-primary py-2.5" disabled={pending}>{pending ? "Connexion…" : "Se connecter"}</button>
      <p className="text-center text-sm text-muted">Pas encore de boutique ? <Link href="/signup" className="font-semibold text-pine">Créer un compte</Link></p>
    </form>
  );
}
