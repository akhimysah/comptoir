"use client";

import { useState } from "react";

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} className="input font-mono text-xs" />
      <button type="button" className="btn" onClick={() => navigator.clipboard.writeText(value).then(() => setCopied(true), () => {})}>{copied ? "Copié" : "Copier"}</button>
    </div>
  );
}
