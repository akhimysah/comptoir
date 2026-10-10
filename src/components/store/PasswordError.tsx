"use client";

import { useSearchParams } from "next/navigation";

export function PasswordError() {
  const pw = useSearchParams().get("pw");
  if (!pw) return null;
  return <p role="alert" className="text-sm text-red-700">{pw === "limit" ? "Trop d'essais. Réessayez dans un quart d'heure." : "Mot de passe incorrect."}</p>;
}
