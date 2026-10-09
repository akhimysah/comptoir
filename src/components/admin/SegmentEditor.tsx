"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { previewSegment, saveSegment } from "@/app/admin/customers/segments/actions";
import { centsToInput, parseMoney } from "@/lib/money";
import { SEGMENT_FIELDS, type SegmentField } from "@/lib/segment-fields";

type Rule = { field: SegmentField; op: string; value: string };
type Preview = { count: number | null; sample: { id: string; name: string; email: string }[] };

export function SegmentEditor({ id, initial, products, tags, currency }: { id?: string; initial: { name: string; match: "all" | "any"; rules: Rule[] }; products: { id: string; title: string }[]; tags: string[]; currency: string }) {
  const [name, setName] = useState(initial.name);
  const [match, setMatch] = useState(initial.match);
  const [rules, setRules] = useState<Rule[]>(initial.rules);
  // Les montants sont saisis en euros mais enregistrés en centimes.
  const [moneyText, setMoneyText] = useState<Record<number, string>>(() => Object.fromEntries(initial.rules.map((r, i) => [i, SEGMENT_FIELDS[r.field].input === "money" && r.value ? centsToInput(Number(r.value)) : ""])));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [, startPreview] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => startPreview(async () => setPreview(await previewSegment(match, rules))), 350);
    return () => clearTimeout(t);
  }, [match, rules]);

  const set = (i: number, p: Partial<Rule>) => setRules(rules.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const setField = (i: number, field: SegmentField) => {
    set(i, { field, op: Object.keys(SEGMENT_FIELDS[field].ops)[0], value: "" });
    setMoneyText({ ...moneyText, [i]: "" });
  };
  const remove = (i: number) => {
    setRules(rules.filter((_, k) => k !== i));
    setMoneyText(Object.fromEntries(Object.entries(moneyText).filter(([k]) => Number(k) !== i).map(([k, v]) => [Number(k) > i ? Number(k) - 1 : Number(k), v])));
  };
  const save = () => startSave(async () => {
    setError(null);
    const res = await saveSegment({ id, name, match, rules });
    if (res?.error) setError(res.error);
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="card flex flex-col gap-3 p-4">
          <label className="label">Nom du segment<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Ex. Clients fidèles de Lyon" className="input" /></label>
        </section>
        <section className="card overflow-hidden">
          <div className="card-h flex-wrap gap-2">
            <h2 className="text-sm font-[650]">Conditions</h2>
            {rules.length > 1 && (
              <label className="flex items-center gap-2 text-[13px]">Les clients qui remplissent
                <select value={match} onChange={(e) => setMatch(e.target.value as "all" | "any")} className="input h-8 w-auto">
                  <option value="all">toutes les conditions</option>
                  <option value="any">au moins une condition</option>
                </select>
              </label>
            )}
          </div>
          {rules.length ? (
            <ul>
              {rules.map((r, i) => {
                const f = SEGMENT_FIELDS[r.field];
                const needsValue = f.input !== "none" && r.op !== "never";
                return (
                  <li key={i} className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
                    {i > 0 && <span className="w-8 text-xs font-[550] uppercase text-muted">{match === "all" ? "et" : "ou"}</span>}
                    <select value={r.field} onChange={(e) => setField(i, e.target.value as SegmentField)} aria-label="Critère" className="input h-8 w-auto">
                      {(Object.keys(SEGMENT_FIELDS) as SegmentField[]).map((k) => <option key={k} value={k}>{SEGMENT_FIELDS[k].label}</option>)}
                    </select>
                    <select value={r.op} onChange={(e) => set(i, { op: e.target.value })} aria-label="Condition" className="input h-8 w-auto">
                      {Object.entries(f.ops).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                    {needsValue && (
                      f.input === "product" ? (
                        <select value={r.value} onChange={(e) => set(i, { value: e.target.value })} aria-label="Produit" className="input h-8 min-w-0 flex-1">
                          <option value="">Choisir un produit…</option>
                          {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                        </select>
                      ) : f.input === "money" ? (
                        <span className="flex items-center gap-1">
                          <input value={moneyText[i] ?? ""} inputMode="decimal" onChange={(e) => { setMoneyText({ ...moneyText, [i]: e.target.value }); const c = parseMoney(e.target.value); set(i, { value: c === null ? "" : String(c) }); }} aria-label="Montant" className="input num h-8 w-24" />
                          <span className="text-muted">{currency}</span>
                        </span>
                      ) : f.input === "text" ? (
                        <>
                          <input value={r.value} onChange={(e) => set(i, { value: e.target.value })} list={r.field === "tag" ? "segment-tags" : undefined} maxLength={120} aria-label="Valeur" placeholder={r.field === "tag" ? "vip" : "France"} className="input h-8 w-40" />
                        </>
                      ) : (
                        <input value={r.value} onChange={(e) => set(i, { value: e.target.value.replace(/\D/g, "") })} inputMode="numeric" aria-label="Nombre" className="input num h-8 w-20" />
                      )
                    )}
                    <button type="button" onClick={() => remove(i)} className="btn ml-auto h-8 w-8 px-0 text-[#8e0b21]" aria-label="Supprimer la condition">✕</button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-5 text-muted">Aucune condition : le segment contient tous vos clients.</p>
          )}
          <datalist id="segment-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
          <div className="px-4 py-3">
            <button type="button" onClick={() => setRules([...rules, { field: "orders", op: "gte", value: "" }])} className="btn">+ Ajouter une condition</button>
          </div>
        </section>
      </div>
      <aside className="flex flex-col gap-4">
        <section className="card flex flex-col gap-3 p-4" aria-live="polite">
          <h2 className="text-sm font-[650]">Aperçu</h2>
          {preview?.count == null ? (
            <p className="text-muted">Complétez les conditions pour voir les clients concernés.</p>
          ) : (
            <>
              <div className="text-2xl font-bold tabular-nums">{preview.count} <span className="text-sm font-normal text-muted">client{preview.count > 1 ? "s" : ""}</span></div>
              {preview.sample.length > 0 && (
                <ul className="flex flex-col gap-1.5 text-[13px]">
                  {preview.sample.map((c) => <li key={c.id}><Link href={`/admin/customers/${c.id}`} className="font-[550] hover:underline">{c.name}</Link><div className="truncate text-xs text-muted">{c.email}</div></li>)}
                  {preview.count > preview.sample.length && <li className="text-xs text-muted">et {preview.count - preview.sample.length} autre{preview.count - preview.sample.length > 1 ? "s" : ""}…</li>}
                </ul>
              )}
            </>
          )}
        </section>
        {error && <p role="alert" className="text-[13px] text-[#8e0b21]">{error}</p>}
        <button type="button" onClick={save} disabled={saving} className="btn btn-primary h-9">{saving ? "Enregistrement…" : "Enregistrer le segment"}</button>
      </aside>
    </div>
  );
}
