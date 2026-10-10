"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createStore, signup } from "../actions";
import { slugify } from "@/lib/utils";
import { keepOnSubmit } from "@/lib/keep-form";

export default function SignupForm({ step }: { step: "store" | "account" }) {
  const [state, action, pending] = useActionState(step === "store" ? createStore : signup, undefined);
  const [storeName, setStoreName] = useState("");
  return (
    <form onSubmit={keepOnSubmit(action)} className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{step === "store" ? "Créez votre boutique" : "Créer ma boutique"}</h1>
        <p className="mt-1 text-sm text-muted">Gratuit, sans carte bancaire.</p>
      </div>
      {step === "account" && (
        <>
          <label className="label">Votre nom<input id="name" name="name" required autoComplete="name" className="input" /></label>
          <label className="label">E-mail<input id="email" name="email" type="email" required autoComplete="email" className="input" /></label>
          <label className="label">Mot de passe<span className="hint">8 caractères minimum.</span><input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="input" /></label>
        </>
      )}
      <label className="label">
        Nom de la boutique
        <input id="storeName" name="storeName" required maxLength={60} className="input" value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Ex. Atelier Argile" />
        {storeName && <span className="hint">Adresse : <span className="font-mono">/s/{slugify(storeName)}</span></span>}
      </label>
      {step === "account" && (
        <label className="flex items-start gap-2 text-[13px] text-muted">
          <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4 shrink-0 accent-[#7c3aed]" />
          <span>J'accepte les <a href="/legal/cgu" target="_blank" className="text-pine underline">conditions d'utilisation</a> et la <a href="/legal/confidentialite" target="_blank" className="text-pine underline">politique de confidentialité</a>.</span>
        </label>
      )}
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button className="btn btn-primary py-2.5" disabled={pending}>{pending ? "Création…" : "Créer ma boutique"}</button>
      {step === "account" && <p className="text-center text-sm text-muted">Déjà inscrit ? <Link href="/login" className="font-semibold text-pine">Se connecter</Link></p>}
    </form>
  );
}
