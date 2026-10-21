"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Rafraîchit les données de la page (sans la recharger) toutes les `seconds` secondes, quand l'onglet est visible. */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
