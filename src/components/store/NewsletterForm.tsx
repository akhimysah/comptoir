"use client";

import { useState } from "react";

export function NewsletterForm({ slug }: { slug: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "done") return <p role="status" className="text-sm">Merci ! Vous êtes inscrit à la newsletter.</p>;
  return (
    <form
      className="flex max-w-sm flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy"); setError(null);
        const res = await fetch("/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, email }) });
        if (res.ok) setState("done"); else { setError((await res.json().catch(() => ({}))).error ?? "Inscription impossible."); setState("idle"); }
      }}
    >
      <span className="text-sm font-semibold text-[var(--c-text)]">Recevez nos nouveautés</span>
      <div className="flex gap-2">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Votre e-mail" aria-label="E-mail pour la newsletter" className="w-full rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] bg-[var(--c-surface)] px-3 py-2 text-[var(--c-text)] outline-none" />
        <button disabled={state === "busy"} className="rounded-[var(--t-radius)] bg-[var(--c-accent)] px-4 text-sm font-semibold text-[var(--c-accent-text)]">S'inscrire</button>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <span className="text-xs">Désabonnement en un clic dans chaque e-mail.</span>
    </form>
  );
}
