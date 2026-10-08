"use client";

import { useRef, useState } from "react";
import { uploadImage } from "./upload";

/** Une image unique : aperçu, remplacement et retrait. */
export function ImageField({ value, onChange, label = "Image", id }: { value: string | null; onChange: (url: string | null) => void; label?: string; id: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1.5 text-sm font-semibold">
      <span>{label}</span>
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-16 w-24 rounded-lg border border-line object-cover" />
        ) : (
          <div className="grid h-16 w-24 place-items-center rounded-lg border-2 border-dashed border-line text-xs font-normal text-muted">Aucune</div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => ref.current?.click()}>{busy ? "Envoi…" : value ? "Remplacer" : "Choisir une image"}</button>
          {value && <button type="button" className="btn btn-sm btn-danger" onClick={() => onChange(null)}>Retirer</button>}
        </div>
      </div>
      <input
        ref={ref}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          setError(null);
          try { onChange(await uploadImage(f)); } catch (err) { setError((err as Error).message); } finally { setBusy(false); e.target.value = ""; }
        }}
      />
      {error && <span className="font-normal text-red-700">{error}</span>}
    </div>
  );
}
