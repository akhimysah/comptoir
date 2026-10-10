"use client";

import { useSearchParams } from "next/navigation";
import { dict } from "@/lib/i18n";
import { useLocale } from "./locale";

const T = dict(
  { limit: "Trop d'essais. Réessayez dans un quart d'heure.", wrong: "Mot de passe incorrect." },
  { limit: "Too many attempts. Please try again in 15 minutes.", wrong: "Incorrect password." },
);

export function PasswordError() {
  const pw = useSearchParams().get("pw");
  const t = T[useLocale()];
  if (!pw) return null;
  return <p role="alert" className="text-sm text-red-700">{pw === "limit" ? t.limit : t.wrong}</p>;
}
