"use client";

import { useEffect, useState } from "react";

type W = Window & { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void; fbq?: ((...a: unknown[]) => void) & { queue?: unknown[]; callMethod?: (...a: unknown[]) => void; loaded?: boolean; version?: string; push?: unknown } ; _fbq?: unknown };

const GA = /^G-[A-Z0-9]{4,20}$/;
const PIXEL = /^\d{6,20}$/;
const consentKey = (slug: string) => `comptoir:consent:${slug}`;

function load(gaId: string, pixelId: string) {
  const w = window as W;
  if (GA.test(gaId) && !w.gtag) {
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag() { (w.dataLayer as unknown[]).push(arguments); }; // eslint-disable-line prefer-rest-params
    w.gtag("js", new Date());
    w.gtag("config", gaId);
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
    document.head.appendChild(s);
  }
  if (PIXEL.test(pixelId) && !w.fbq) {
    const q: unknown[] = [];
    const fbq = ((...a: unknown[]) => { if (fbq.callMethod) fbq.callMethod(...a); else q.push(a); }) as NonNullable<W["fbq"]>;
    fbq.queue = q; fbq.loaded = true; fbq.version = "2.0"; fbq.push = fbq;
    w.fbq = fbq; w._fbq = fbq;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/fr_FR/fbevents.js";
    document.head.appendChild(s);
    fbq("init", pixelId);
    fbq("track", "PageView");
  }
}

/** Bandeau cookies et chargement des mesures d'audience, seulement après accord du visiteur. */
export function Tracking({ slug, gaId, pixelId }: { slug: string; gaId: string; pixelId: string }) {
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    let v: string | null = null;
    try { v = localStorage.getItem(consentKey(slug)); } catch {}
    if (v === "yes") load(gaId, pixelId);
    else if (v !== "no") setAsk(true);
    const reopen = () => setAsk(true);
    window.addEventListener("consent:open", reopen);
    return () => window.removeEventListener("consent:open", reopen);
  }, [slug, gaId, pixelId]);
  const decide = (yes: boolean) => {
    try { localStorage.setItem(consentKey(slug), yes ? "yes" : "no"); } catch {}
    setAsk(false);
    if (yes) load(gaId, pixelId);
  };
  if (!ask) return null;
  return (
    <div role="dialog" aria-label="Cookies" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-xl flex-col gap-3 rounded-[var(--t-radius)] border border-[color-mix(in_srgb,var(--c-text)_12%,transparent)] bg-[var(--c-bg)] p-4 text-sm shadow-[0_18px_50px_-12px_rgba(0,0,0,.35)] sm:flex-row sm:items-center">
      <p className="flex-1 text-[var(--c-muted)]">Nous utilisons des cookies de mesure d'audience pour améliorer la boutique. Vous pouvez les accepter ou les refuser.</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => decide(false)} className="rounded-[var(--t-radius)] border border-[var(--c-text)] px-4 py-2 font-semibold">Refuser</button>
        <button type="button" onClick={() => decide(true)} className="rounded-[var(--t-radius)] bg-[var(--c-accent)] px-4 py-2 font-semibold text-[var(--c-accent-text)]">Accepter</button>
      </div>
    </div>
  );
}

/** Lien « Gérer les cookies » du pied de page : rouvre le bandeau. */
export function ConsentLink() {
  return <button type="button" onClick={() => window.dispatchEvent(new Event("consent:open"))} className="hover:opacity-70">Gérer les cookies</button>;
}

/** Achat confirmé : envoyé une seule fois par commande, et seulement si les mesures sont chargées (accord donné). */
export function TrackPurchase({ orderId, valueCents, currency }: { orderId: string; valueCents: number; currency: string }) {
  useEffect(() => {
    const key = `comptoir:tracked:${orderId}`;
    try { if (localStorage.getItem(key)) return; } catch {}
    let tries = 0;
    const id = setInterval(() => {
      const w = window as W;
      if (w.gtag || w.fbq || ++tries > 10) {
        clearInterval(id);
        if (!w.gtag && !w.fbq) return;
        const value = valueCents / 100;
        w.gtag?.("event", "purchase", { transaction_id: orderId, value, currency });
        w.fbq?.("track", "Purchase", { value, currency });
        try { localStorage.setItem(key, "1"); } catch {}
      }
    }, 500);
    return () => clearInterval(id);
  }, [orderId, valueCents, currency]);
  return null;
}
