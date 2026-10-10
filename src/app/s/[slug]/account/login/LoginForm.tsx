"use client";

import { useState, useTransition } from "react";
import { confirmCode, requestCode } from "../actions";
import { useLocale } from "@/components/store/locale";
import { dict } from "@/lib/i18n";

const T = dict(
  {
    signIn: "Se connecter",
    enterCode: "Saisissez le code",
    intro: (store: string) => `Suivez vos commandes ${store}. Pas de mot de passe : nous vous envoyons un code par e-mail.`,
    sent: (email: string) => `Nous avons envoyé un code à 6 chiffres à ${email}.`,
    email: "E-mail",
    sending: "Envoi…",
    getCode: "Recevoir un code",
    codeLabel: "Code reçu par e-mail",
    verifying: "Vérification…",
    change: "Changer d'adresse ou renvoyer un code",
  },
  {
    signIn: "Sign in",
    enterCode: "Enter the code",
    intro: (store: string) => `Track your ${store} orders. No password needed: we'll email you a code.`,
    sent: (email: string) => `We sent a 6-digit code to ${email}.`,
    email: "Email",
    sending: "Sending…",
    getCode: "Get a code",
    codeLabel: "Code received by email",
    verifying: "Verifying…",
    change: "Change email or resend code",
  },
);

const field = "w-full rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] bg-[var(--c-surface)] px-4 py-3 outline-none focus:border-[var(--c-text)]";
const btn = "h-12 rounded-[var(--t-radius)] bg-[var(--c-accent)] font-semibold text-[var(--c-accent-text)] disabled:opacity-40";

export function CustomerLogin({ slug, storeName }: { slug: string; storeName: string }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const t = T[useLocale()];

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-5 px-4 py-16">
      <div>
        <h1 className="font-[family-name:var(--t-display)] text-3xl font-semibold">{step === "email" ? t.signIn : t.enterCode}</h1>
        <p className="mt-2 text-[var(--c-muted)]">{step === "email" ? t.intro(storeName) : t.sent(email)}</p>
      </div>
      {step === "email" ? (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); start(async () => { setError(null); const r = await requestCode(slug, email); if (r.error) setError(r.error); else setStep("code"); }); }}>
          <input id="cust-email" type="email" required autoComplete="email" placeholder={t.email} aria-label={t.email} value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button className={btn} disabled={pending}>{pending ? t.sending : t.getCode}</button>
        </form>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); start(async () => { setError(null); const r = await confirmCode(slug, email, code); if (r?.error) setError(r.error); }); }}>
          <input id="cust-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" aria-label={t.codeLabel} value={code} onChange={(e) => setCode(e.target.value)} className={`${field} text-center text-2xl tracking-[0.4em]`} autoFocus />
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button className={btn} disabled={pending || code.replace(/\D/g, "").length !== 6}>{pending ? t.verifying : t.signIn}</button>
          <button type="button" className="text-sm underline underline-offset-4" onClick={() => { setStep("email"); setCode(""); setError(null); }}>{t.change}</button>
        </form>
      )}
    </div>
  );
}
