"use client";

import { useState } from "react";

const field = "w-full rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] bg-[var(--c-surface)] px-3 py-2.5 outline-none focus:border-[var(--c-text)]";

export function ReviewForm({ slug, productId }: { slug: string; productId: string }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "done") return <p role="status" className="rounded-[var(--t-radius)] bg-[var(--c-surface)] px-4 py-3">Merci pour votre avis ! Il sera publié après vérification par la boutique.</p>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="self-start rounded-[var(--t-radius)] border border-[var(--c-text)] px-5 py-2.5 font-semibold">Écrire un avis</button>;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    setError(null);
    const d = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...d, slug, productId, rating }) });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setState("done");
    else { setError(json.error ?? "L'envoi a échoué. Réessayez."); setState("idle"); }
  }

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-3 rounded-[var(--t-radius)] bg-[var(--c-surface)] p-5">
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Votre note</legend>
        <div className="flex text-3xl" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} type="button" aria-label={`${i} étoile${i > 1 ? "s" : ""}`} aria-pressed={rating === i} onMouseEnter={() => setHover(i)} onClick={() => setRating(i)} className={(hover || rating) >= i ? "text-[#e3a008]" : "text-[color-mix(in_srgb,var(--c-text)_20%,transparent)]"}>★</button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <input id="rv-name" name="name" required maxLength={60} placeholder="Prénom" aria-label="Prénom" className={field} />
        <input id="rv-email" name="email" type="email" required placeholder="E-mail (non publié)" aria-label="E-mail" className={field} />
      </div>
      <input id="rv-title" name="title" maxLength={120} placeholder="Titre (optionnel)" aria-label="Titre" className={field} />
      <textarea id="rv-body" name="body" required minLength={10} maxLength={3000} placeholder="Qu'avez-vous pensé de ce produit ?" aria-label="Votre avis" className={`${field} min-h-[110px]`} />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button disabled={state === "sending" || !rating} className="self-start rounded-[var(--t-radius)] bg-[var(--c-accent)] px-5 py-2.5 font-semibold text-[var(--c-accent-text)] disabled:opacity-40">{state === "sending" ? "Envoi…" : "Publier mon avis"}</button>
    </form>
  );
}
