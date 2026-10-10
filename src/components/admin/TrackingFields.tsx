"use client";

import { useState } from "react";
import { CARRIERS } from "@/lib/tracking";

/** Transporteur + numéro de suivi (+ lien si « Autre transporteur »), à placer dans un formulaire. */
export function TrackingFields({ carrier = "colissimo", number = "", url = "" }: { carrier?: string; number?: string; url?: string }) {
  const [c, setC] = useState(CARRIERS[carrier] ? carrier : "colissimo");
  return (
    <div className="grid gap-2 sm:grid-cols-[180px_1fr] sm:items-end">
      <label className="label">Transporteur
        <select name="carrier" value={c} onChange={(e) => setC(e.target.value)} className="input">
          {Object.entries(CARRIERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </label>
      <label className="label">Numéro de suivi <span className="hint">Facultatif</span>
        <input name="trackingNumber" defaultValue={number} maxLength={60} autoComplete="off" placeholder="6A12345678901" className="input font-mono" />
      </label>
      {c === "other" && (
        <label className="label sm:col-span-2">Lien de suivi <span className="hint">Adresse https:// de la page de suivi du transporteur</span>
          <input name="trackingUrl" type="url" defaultValue={url} maxLength={500} placeholder="https://…" className="input" />
        </label>
      )}
    </div>
  );
}
