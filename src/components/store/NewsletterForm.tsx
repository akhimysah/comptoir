"use client";

import { useState } from "react";
import { dict } from "@/lib/i18n";
import { useLocale } from "./locale";

const T = dict(
  {
    thanks: "Merci ! Vous êtes inscrit à la newsletter.",
    failed: "Inscription impossible.",
    title: "Recevez nos nouveautés",
    placeholder: "Votre e-mail",
    label: "E-mail pour la newsletter",
    subscribe: "S'inscrire",
    unsubscribe: "Désabonnement en un clic dans chaque e-mail.",
  },
  {
    thanks: "Thank you! You're now subscribed to our newsletter.",
    failed: "Subscription failed.",
    title: "Get our latest news",
    placeholder: "Your email",
    label: "Email for the newsletter",
    subscribe: "Subscribe",
    unsubscribe: "Unsubscribe in one click from any email.",
  },
);

export function NewsletterForm({ slug }: { slug: string }) {
  const t = T[useLocale()];
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "done") return <p role="status" className="text-sm">{t.thanks}</p>;
  return (
    <form
      className="flex max-w-sm flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy"); setError(null);
        const res = await fetch("/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, email }) });
        if (res.ok) setState("done"); else { setError((await res.json().catch(() => ({}))).error ?? t.failed); setState("idle"); }
      }}
    >
      <span className="text-sm font-semibold text-[var(--c-text)]">{t.title}</span>
      <div className="flex gap-2">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.placeholder} aria-label={t.label} className="w-full rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] bg-[var(--c-surface)] px-3 py-2 text-[var(--c-text)] outline-none" />
        <button disabled={state === "busy"} className="rounded-[var(--t-radius)] bg-[var(--c-accent)] px-4 text-sm font-semibold text-[var(--c-accent-text)]">{t.subscribe}</button>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <span className="text-xs">{t.unsubscribe}</span>
    </form>
  );
}
