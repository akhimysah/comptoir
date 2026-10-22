"use client";

import Link from "next/link";
import { choicesOf, type MetafieldDef } from "@/lib/metafields";

/** Saisie des champs personnalisés d'un élément (collection, page, boutique…), selon leurs définitions. */
export function MetafieldInputs({ defs, values, onChange, title = "Champs personnalisés" }: { defs: MetafieldDef[]; values: Record<string, string>; onChange: (values: Record<string, string>) => void; title?: string }) {
  if (!defs.length) return null;
  const set = (key: string, x: string) => { const n = { ...values }; if (x === "") delete n[key]; else n[key] = x; onChange(n); };
  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between"><h2 className="text-sm font-[650]">{title}</h2><Link href="/admin/settings/custom-data" className="text-xs text-pine hover:underline">Gérer les champs</Link></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {defs.map((d) => {
          const v = values[d.key] ?? "";
          return (
            <label key={d.key} className={`label ${d.type === "multiline" ? "sm:col-span-2" : ""}`}>{d.name}{d.unit ? ` (${d.unit})` : ""}
              {d.type === "multiline" ? <textarea value={v} onChange={(e) => set(d.key, e.target.value)} rows={3} maxLength={2000} className="input" />
                : d.type === "boolean" ? <select value={v} onChange={(e) => set(d.key, e.target.value)} className="input"><option value="">—</option><option value="true">Oui</option><option value="false">Non</option></select>
                : d.type === "choice" ? <select value={v} onChange={(e) => set(d.key, e.target.value)} className="input"><option value="">—</option>{choicesOf(d).map((c) => <option key={c} value={c}>{c}</option>)}</select>
                : <input value={v} onChange={(e) => set(d.key, e.target.value)} inputMode={d.type === "number" ? "decimal" : undefined} maxLength={200} className="input" />}
            </label>
          );
        })}
      </div>
    </section>
  );
}
