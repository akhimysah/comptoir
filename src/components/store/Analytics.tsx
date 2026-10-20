"use client";

import { useEffect } from "react";

/**
 * Mesure d'audience : une page vue au chargement (avec le référent et les paramètres UTM de la première page),
 * puis un battement de cœur toutes les 30 s tant que l'onglet est visible (visiteurs en direct).
 * Rien de personnel n'est envoyé.
 */
export function Analytics({ slug }: { slug: string }) {
  useEffect(() => {
    const key = `rv:landing:${slug}`;
    let landing = false;
    try { landing = !sessionStorage.getItem(key); if (landing) sessionStorage.setItem(key, "1"); } catch {}
    const utm: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(location.search)) if (k.startsWith("utm_")) utm[k] = v;
    const device = /Mobi|Android/i.test(navigator.userAgent) ? (/iPad|Tablet/i.test(navigator.userAgent) ? "tablet" : "mobile") : "desktop";
    const cartItems = () => { try { return (JSON.parse(localStorage.getItem(`comptoir:cart:${slug}`) ?? "[]") as { quantity: number }[]).reduce((s, l) => s + (l.quantity || 0), 0); } catch { return 0; } };
    const send = (type: "view" | "ping") => fetch(`/s/${slug}/track`, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, path: location.pathname, referrer: document.referrer, utm, landing, cartItems: cartItems(), device }) }).catch(() => {});
    send("view");
    const id = setInterval(() => { if (document.visibilityState === "visible") send("ping"); }, 30_000);
    return () => clearInterval(id);
  }, [slug]);
  return null;
}
