"use client";

import { useEffect } from "react";

/**
 * Mesure les Core Web Vitals (LCP, INP, CLS) avec les API natives du navigateur et les envoie une fois,
 * quand le visiteur quitte la page. Aucune donnée personnelle : juste trois nombres.
 */
export function Vitals({ slug }: { slug: string }) {
  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    let lcp: number | null = null, inp: number | null = null, cls = 0, sent = false;
    const observers: PerformanceObserver[] = [];
    const observe = (type: string, cb: (entries: PerformanceEntry[]) => void, opts: PerformanceObserverInit = {}) => {
      try { const o = new PerformanceObserver((l) => cb(l.getEntries())); o.observe({ type, buffered: true, ...opts }); observers.push(o); } catch {}
    };
    observe("largest-contentful-paint", (es) => { const last = es[es.length - 1]; if (last) lcp = last.startTime; });
    observe("layout-shift", (es) => { for (const e of es as (PerformanceEntry & { hadRecentInput?: boolean; value?: number })[]) if (!e.hadRecentInput) cls += e.value ?? 0; });
    observe("event", (es) => { for (const e of es as (PerformanceEntry & { interactionId?: number })[]) if (e.interactionId) inp = Math.max(inp ?? 0, e.duration); }, { durationThreshold: 40 } as PerformanceObserverInit);
    const send = () => {
      if (sent || (lcp === null && inp === null && cls === 0)) return;
      sent = true;
      const body = JSON.stringify({ lcp, inp, cls: Math.round(cls * 1000) / 1000 });
      if (!navigator.sendBeacon?.(`/s/${slug}/vitals`, new Blob([body], { type: "application/json" }))) fetch(`/s/${slug}/vitals`, { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
    };
    const onHide = () => { if (document.visibilityState === "hidden") send(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", send);
    return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", send); observers.forEach((o) => o.disconnect()); };
  }, [slug]);
  return null;
}
