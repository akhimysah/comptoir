"use client";

import { useEffect, useState } from "react";

/** Compte à rebours jusqu'à une date (jours, heures, minutes, secondes), mis à jour chaque seconde. */
export function Countdown({ endsAt, labels }: { endsAt: string; labels: [string, string, string, string] }) {
  const end = new Date(endsAt.length === 10 ? `${endsAt}T23:59:59` : endsAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = Math.max(0, end - now);
  if (!Number.isFinite(end)) return null;
  const parts = [Math.floor(left / 86400_000), Math.floor(left / 3600_000) % 24, Math.floor(left / 60_000) % 60, Math.floor(left / 1000) % 60];
  return (
    <div className="flex flex-wrap justify-center gap-3" aria-live="off">
      {parts.map((n, i) => (
        <div key={i} className="min-w-[72px] rounded-[var(--t-radius)] bg-[var(--c-surface)] px-3 py-3 text-center">
          <div className="text-3xl font-bold tabular-nums">{String(n).padStart(2, "0")}</div>
          <div className="text-xs uppercase tracking-wide text-[var(--c-muted)]">{labels[i]}</div>
        </div>
      ))}
    </div>
  );
}
