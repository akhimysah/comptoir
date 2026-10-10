import { Suspense } from "react";
import { PasswordError } from "./PasswordError";
import { dict, type Locale } from "@/lib/i18n";

const T = dict(
  { have: "Vous avez le mot de passe ?", enter: "Entrer", powered: "Boutique propulsée par Parnassa Pay" },
  { have: "Have a password?", enter: "Enter", powered: "Store powered by Parnassa Pay" },
);

/** Page « Ouverture prochaine » d'une boutique protégée par mot de passe. */
export function PasswordGate({ slug, name, message, locale = "fr" }: { slug: string; name: string; message: string; locale?: Locale }) {
  const t = T[locale];
  return (
    <main className="grid min-h-screen place-items-center px-4 py-16">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <h1 className="font-[family-name:var(--t-display)] text-4xl font-semibold">{name}</h1>
        <p className="whitespace-pre-line text-lg text-[var(--c-muted)]">{message}</p>
        <form action={`/s/${slug}/password`} method="post" className="flex w-full flex-col gap-2">
          <label htmlFor="store-password" className="text-sm font-semibold">{t.have}</label>
          <div className="flex gap-2">
            <input id="store-password" name="password" type="password" required autoComplete="off" className="min-w-0 flex-1 rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_22%,transparent)] bg-[var(--c-surface)] px-4 py-3 outline-none focus:border-[var(--c-text)]" />
            <button className="rounded-[var(--t-radius)] bg-[var(--c-accent)] px-5 font-semibold text-[var(--c-accent-text)]">{t.enter}</button>
          </div>
          <Suspense><PasswordError /></Suspense>
        </form>
        <a href="/" className="text-xs text-[var(--c-muted)] hover:opacity-70">{t.powered}</a>
      </div>
    </main>
  );
}
