"use client";

import { useMemo, useState, useTransition } from "react";
import { processRefund } from "./actions";
import { Thumb } from "@/components/ui";
import { centsToInput, formatMoney, parseMoney } from "@/lib/money";

type Item = { id: string; title: string; variant: string; priceCents: number; remaining: number; suggestedUnit: number; image: string | null; hue: number };

export function RefundForm({ orderId, items, currency, refundable, shippingPaid, stripe, returnId, initialQty, initialReason }: { orderId: string; items: Item[]; currency: string; refundable: number; shippingPaid: number; stripe: boolean; returnId?: string; initialQty?: Record<string, number>; initialReason?: string }) {
  const [qty, setQty] = useState<Record<string, number>>(initialQty ?? {});
  const [shipping, setShipping] = useState("0");
  const [custom, setCustom] = useState<string | null>(null);
  const [restock, setRestock] = useState(true);
  const [notify, setNotify] = useState(true);
  const [reason, setReason] = useState(initialReason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const m = (c: number) => formatMoney(c, currency);

  const suggested = useMemo(() => Math.min(refundable, items.reduce((s, i) => s + i.suggestedUnit * (qty[i.id] ?? 0), 0) + (parseMoney(shipping) ?? 0)), [qty, shipping, items, refundable]);
  const amountStr = custom ?? centsToInput(suggested);
  const amount = parseMoney(amountStr) ?? 0;
  const count = Object.values(qty).reduce((a, b) => a + b, 0);

  const submit = () => start(async () => {
    setError(null);
    const res = await processRefund({ orderId, lines: items.map((i) => ({ orderItemId: i.id, quantity: qty[i.id] ?? 0 })), shipping, amount: amountStr, restock, notify, reason, returnId });
    if (res?.error) setError(res.error);
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="card overflow-hidden">
          <div className="card-h"><h2 className="text-sm font-[650]">Articles</h2></div>
          <ul>
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                <Thumb image={i.image} hue={i.hue} title={i.title} className="h-10 w-10 text-[10px]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-[550]">{i.title}</div>
                  <div className="text-xs text-muted">{i.variant !== "Par défaut" ? `${i.variant} · ` : ""}{m(i.priceCents)}{i.suggestedUnit !== i.priceCents ? ` (${m(i.suggestedUnit)} après remise)` : ""}</div>
                </div>
                {i.remaining > 0 ? (
                  <label className="flex items-center gap-2 text-[13px]">
                    <input type="number" min={0} max={i.remaining} value={qty[i.id] ?? 0} onChange={(e) => { setCustom(null); setQty({ ...qty, [i.id]: Math.max(0, Math.min(i.remaining, Math.floor(Number(e.target.value) || 0))) }); }} className="input num w-16" aria-label={`Quantité à rembourser : ${i.title}`} />
                    <span className="text-muted">/ {i.remaining}</span>
                  </label>
                ) : <span className="text-xs text-muted">Déjà remboursé</span>}
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 border-t border-line px-4 py-3 text-[13px]"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="h-4 w-4 accent-[#7c3aed]" />Remettre les articles en stock</label>
        </section>
        <section className="card flex flex-col gap-2 p-4">
          <h2 className="text-sm font-[650]">Livraison</h2>
          <label className="flex items-center gap-2 text-[13px]">Rembourser les frais de livraison
            <input inputMode="decimal" value={shipping} onChange={(e) => { setCustom(null); setShipping(e.target.value); }} className="input num w-24" aria-label="Frais de livraison à rembourser" />
            <span className="text-muted">sur {m(shippingPaid)} payés</span>
          </label>
        </section>
        <section className="card flex flex-col gap-2 p-4">
          <label className="label">Motif du remboursement<span className="hint">Visible par le client si vous lui envoyez une notification.</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="input" placeholder="Ex. Article arrivé cassé" />
          </label>
        </section>
      </div>
      <aside className="flex flex-col gap-4">
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="text-sm font-[650]">Récapitulatif</h2>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-[13px]">
            <dt className="text-muted">Articles sélectionnés</dt><dd className="num text-right">{count}</dd>
            <dt className="text-muted">Montant suggéré</dt><dd className="num text-right">{m(suggested)}</dd>
            <dt className="text-muted">Remboursable au maximum</dt><dd className="num text-right">{m(refundable)}</dd>
          </dl>
          <label className="label">Montant du remboursement
            <input inputMode="decimal" value={amountStr} onChange={(e) => setCustom(e.target.value)} className="input num text-base font-[650]" aria-label="Montant du remboursement" />
          </label>
          <p className="text-xs text-muted">{stripe ? "Le montant sera recrédité sur la carte du client via Stripe." : "Paiement hors Stripe : remboursez le client vous-même (virement, espèces). La commande sera mise à jour."}</p>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4 accent-[#7c3aed]" />Prévenir le client par e-mail</label>
          {error && <p role="alert" className="text-[13px] text-[#8e0b21]">{error}</p>}
          <button className="btn btn-primary h-9" disabled={pending || (amount <= 0 && count === 0)} onClick={submit}>{pending ? "Remboursement…" : `Rembourser ${m(amount)}`}</button>
        </section>
      </aside>
    </div>
  );
}
