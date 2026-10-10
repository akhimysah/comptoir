"use client";

import { useState } from "react";
import { dict } from "@/lib/i18n";
import { useLocale } from "./locale";

const T = dict(
  {
    thanks: "Merci pour votre avis ! Il sera publié après vérification par la boutique.",
    write: "Écrire un avis",
    failed: "L'envoi a échoué. Réessayez.",
    yourRating: "Votre note",
    stars: (n: number) => `${n} étoile${n > 1 ? "s" : ""}`,
    firstName: "Prénom",
    emailPlaceholder: "E-mail (non publié)",
    email: "E-mail",
    titlePlaceholder: "Titre (optionnel)",
    title: "Titre",
    bodyPlaceholder: "Qu'avez-vous pensé de ce produit ?",
    body: "Votre avis",
    sending: "Envoi…",
    submit: "Publier mon avis",
  },
  {
    thanks: "Thank you for your review! It will be published once the shop has checked it.",
    write: "Write a review",
    failed: "Sending failed. Please try again.",
    yourRating: "Your rating",
    stars: (n: number) => `${n} star${n > 1 ? "s" : ""}`,
    firstName: "First name",
    emailPlaceholder: "Email (not published)",
    email: "Email",
    titlePlaceholder: "Title (optional)",
    title: "Title",
    bodyPlaceholder: "What did you think of this product?",
    body: "Your review",
    sending: "Sending…",
    submit: "Post my review",
  },
);

const field = "w-full rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] bg-[var(--c-surface)] px-3 py-2.5 outline-none focus:border-[var(--c-text)]";

export function ReviewForm({ slug, productId }: { slug: string; productId: string }) {
  const t = T[useLocale()];
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "done") return <p role="status" className="rounded-[var(--t-radius)] bg-[var(--c-surface)] px-4 py-3">{t.thanks}</p>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="self-start rounded-[var(--t-radius)] border border-[var(--c-text)] px-5 py-2.5 font-semibold">{t.write}</button>;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    setError(null);
    const d = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch(`/s/${slug}/reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...d, slug, productId, rating }) });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setState("done");
    else { setError(json.error ?? t.failed); setState("idle"); }
  }

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-3 rounded-[var(--t-radius)] bg-[var(--c-surface)] p-5">
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">{t.yourRating}</legend>
        <div className="flex text-3xl" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} type="button" aria-label={t.stars(i)} aria-pressed={rating === i} onMouseEnter={() => setHover(i)} onClick={() => setRating(i)} className={(hover || rating) >= i ? "text-[#e3a008]" : "text-[color-mix(in_srgb,var(--c-text)_20%,transparent)]"}>★</button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <input id="rv-name" name="name" required maxLength={60} placeholder={t.firstName} aria-label={t.firstName} className={field} />
        <input id="rv-email" name="email" type="email" required placeholder={t.emailPlaceholder} aria-label={t.email} className={field} />
      </div>
      <input id="rv-title" name="title" maxLength={120} placeholder={t.titlePlaceholder} aria-label={t.title} className={field} />
      <textarea id="rv-body" name="body" required minLength={10} maxLength={3000} placeholder={t.bodyPlaceholder} aria-label={t.body} className={`${field} min-h-[110px]`} />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button disabled={state === "sending" || !rating} className="self-start rounded-[var(--t-radius)] bg-[var(--c-accent)] px-5 py-2.5 font-semibold text-[var(--c-accent-text)] disabled:opacity-40">{state === "sending" ? t.sending : t.submit}</button>
    </form>
  );
}
