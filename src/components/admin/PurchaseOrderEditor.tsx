"use client";

import { useMemo, useState, useTransition } from "react";
import { savePurchaseOrder, type PurchaseOrderInput } from "@/app/admin/products/purchase-orders/actions";
import { Thumb } from "@/components/ui";
import { centsToInput, formatMoney, parseMoney } from "@/lib/money";

type V = { id: string; title: string; variant: string; sku: string; stock: number; costCents: number | null; image: string | null; hue: number; low: boolean };
type Line = { variantId: string; quantity: number; cost: string };

export function PurchaseOrderEditor({ initial, suppliers, variants, currency, threshold }: { initial: Omit<PurchaseOrderInput, "lines" | "newSupplier"> & { lines: Line[] }; suppliers: { id: string; name: string }[]; variants: V[]; currency: string; threshold: number }) {
  const [supplierId, setSupplierId] = useState<string>(initial.supplierId ?? (suppliers[0]?.id ?? "new"));
  const [newSupplier, setNewSupplier] = useState({ name: "", email: "" });
  const [expectedAt, setExpectedAt] = useState(initial.expectedAt);
  const [shipping, setShipping] = useState(initial.shipping);
  const [note, setNote] = useState(initial.note);
  const [lines, setLines] = useState<Line[]>(initial.lines);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const m = (c: number) => formatMoney(c, currency);

  const byId = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);
  const results = q.trim() ? variants.filter((v) => `${v.title} ${v.variant} ${v.sku}`.toLowerCase().includes(q.toLowerCase()) && !lines.some((l) => l.variantId === v.id)).slice(0, 8) : [];
  const add = (v: V, quantity = 1) => setLines((ls) => (ls.some((l) => l.variantId === v.id) ? ls : [...ls, { variantId: v.id, quantity, cost: v.costCents === null ? "" : centsToInput(v.costCents) }]));
  const lowToAdd = variants.filter((v) => v.low && !lines.some((l) => l.variantId === v.id));
  const subtotal = lines.reduce((s, l) => s + l.quantity * (parseMoney(l.cost) ?? 0), 0);
  const total = subtotal + (parseMoney(shipping) ?? 0);

  const save = () => start(async () => {
    setError(null);
    const res = await savePurchaseOrder({
      id: initial.id, supplierId: supplierId === "new" || supplierId === "" ? null : supplierId,
      newSupplier: supplierId === "new" && newSupplier.name.trim() ? newSupplier : null,
      expectedAt, shipping, note, lines,
    });
    if (res?.error) setError(res.error);
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="card overflow-visible">
          <div className="card-h flex-wrap gap-2">
            <h2 className="text-sm font-[650]">Articles</h2>
            {lowToAdd.length > 0 && (
              <button type="button" className="btn btn-sm" onClick={() => lowToAdd.forEach((v) => add(v, Math.max(1, threshold * 3 - v.stock)))}>
                + Ajouter les {lowToAdd.length} article{lowToAdd.length > 1 ? "s" : ""} en stock faible
              </button>
            )}
          </div>
          <div className="relative px-4 pb-3">
            <input className="input" placeholder="Rechercher un produit, une variante ou une référence" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ajouter un article au bon de commande" />
            {results.length > 0 && (
              <ul className="absolute inset-x-4 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl bg-white p-1 shadow-[0_4px_16px_rgba(0,0,0,.15),0_0_0_1px_rgba(0,0,0,.06)]">
                {results.map((v) => (
                  <li key={v.id}>
                    <button type="button" onClick={() => { add(v); setQ(""); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[#f1f1f1]">
                      <Thumb image={v.image} hue={v.hue} title={v.title} className="h-8 w-8 text-[9px]" />
                      <span className="min-w-0 flex-1"><span className="block truncate">{v.title}{v.variant !== "Par défaut" ? ` · ${v.variant}` : ""}</span><span className="text-xs text-muted">{v.stock} en stock{v.sku ? ` · ${v.sku}` : ""}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {lines.length ? (
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[460px]">
                <thead><tr><th className="th">Article</th><th className="th">En stock</th><th className="th">Quantité</th><th className="th">Coût unitaire</th><th className="th text-right">Total</th><th className="th" /></tr></thead>
                <tbody>
                  {lines.map((l, i) => {
                    const v = byId.get(l.variantId);
                    const set = (p: Partial<Line>) => setLines(lines.map((x, k) => (k === i ? { ...x, ...p } : x)));
                    return (
                      <tr key={l.variantId}>
                        <td className="td"><div className="flex items-center gap-2"><Thumb image={v?.image ?? null} hue={v?.hue ?? 200} title={v?.title ?? "?"} className="h-8 w-8 text-[9px]" /><span className="min-w-0"><span className="block truncate font-[550]">{v?.title ?? "Article supprimé"}</span><span className="text-xs text-muted">{v && v.variant !== "Par défaut" ? v.variant : ""}{v?.sku ? ` ${v.sku}` : ""}</span></span></div></td>
                        <td className="td num text-muted">{v?.stock ?? "—"}</td>
                        <td className="td"><input type="number" min={1} value={l.quantity} onChange={(e) => set({ quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} aria-label={`Quantité ${v?.title ?? ""}`} className="input num w-16" /></td>
                        <td className="td"><input inputMode="decimal" value={l.cost} onChange={(e) => set({ cost: e.target.value })} placeholder="0,00" aria-label={`Coût unitaire ${v?.title ?? ""}`} className="input num w-20" /></td>
                        <td className="td num text-right">{m(l.quantity * (parseMoney(l.cost) ?? 0))}</td>
                        <td className="td text-right"><button type="button" onClick={() => setLines(lines.filter((_, k) => k !== i))} className="text-muted hover:text-[#8e0b21]" aria-label={`Retirer ${v?.title ?? "l'article"}`}>✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="border-t border-line px-4 py-6 text-center text-muted">Ajoutez les articles à commander.</p>
          )}
        </section>
        <section className="card flex flex-col gap-2 p-4">
          <label className="label">Note au fournisseur <span className="hint">Incluse dans le bon envoyé.</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} className="input" placeholder="Conditionnement, référence de votre compte client…" />
          </label>
        </section>
      </div>
      <aside className="flex flex-col gap-4">
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="text-sm font-[650]">Fournisseur</h2>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="input" aria-label="Fournisseur">
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="new">+ Nouveau fournisseur</option>
            <option value="">Sans fournisseur</option>
          </select>
          {supplierId === "new" && (
            <>
              <input value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} maxLength={80} placeholder="Nom du fournisseur" aria-label="Nom du nouveau fournisseur" className="input" />
              <input value={newSupplier.email} onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })} maxLength={120} type="email" placeholder="E-mail (pour lui envoyer le bon)" aria-label="E-mail du nouveau fournisseur" className="input" />
            </>
          )}
          <label className="label">Livraison prévue<input type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} className="input" /></label>
        </section>
        <section className="card flex flex-col gap-2 p-4">
          <h2 className="text-sm font-[650]">Coût</h2>
          <dl className="grid grid-cols-[1fr_auto] items-center gap-y-2 text-[13px]">
            <dt className="text-muted">Articles ({lines.reduce((s, l) => s + l.quantity, 0)})</dt><dd className="num text-right">{m(subtotal)}</dd>
            <dt className="text-muted">Frais de port</dt><dd><input inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="0,00" aria-label="Frais de port" className="input num h-7 w-24 py-1 text-right" /></dd>
            <dt className="font-[650]">Total</dt><dd className="num text-right font-[650]">{m(total)}</dd>
          </dl>
        </section>
        {error && <p role="alert" className="text-[13px] text-[#8e0b21]">{error}</p>}
        <button type="button" onClick={save} disabled={pending} className="btn btn-primary h-9">{pending ? "Enregistrement…" : "Enregistrer le brouillon"}</button>
      </aside>
    </div>
  );
}
