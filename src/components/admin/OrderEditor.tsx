"use client";

import { useMemo, useState, useTransition } from "react";
import { saveOrderEdit } from "@/app/admin/orders/[id]/edit/actions";
import { Thumb } from "@/components/ui";
import { centsToInput, formatMoney, parseMoney } from "@/lib/money";

type Item = { id: string; title: string; variant: string; priceCents: number; quantity: number; image: string | null; hue: number };
type V = { id: string; title: string; variant: string; priceCents: number; stock: number; image: string | null; hue: number };

export function OrderEditor({ orderId, items, variants, currency, shippingCents, discount, invoiceSent }: { orderId: string; items: Item[]; variants: V[]; currency: string; shippingCents: number; discount: { kind: "percent" | "fixed" | "none"; value: number }; invoiceSent: boolean }) {
  const [qty, setQty] = useState<Record<string, number>>(Object.fromEntries(items.map((i) => [i.id, i.quantity])));
  const [added, setAdded] = useState<{ variantId: string; quantity: number }[]>([]);
  const [shipping, setShipping] = useState(centsToInput(shippingCents));
  const [resend, setResend] = useState(invoiceSent);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const m = (c: number) => formatMoney(c, currency);

  const subtotal = items.reduce((s, i) => s + i.priceCents * (qty[i.id] ?? 0), 0) + added.reduce((s, a) => s + (variants.find((v) => v.id === a.variantId)?.priceCents ?? 0) * a.quantity, 0);
  const disc = discount.kind === "percent" ? Math.round((subtotal * discount.value) / 100) : Math.min(discount.value, subtotal);
  const ship = parseMoney(shipping) ?? 0;
  const oldTotal = items.reduce((s, i) => s + i.priceCents * i.quantity, 0) - (discount.kind === "percent" ? Math.round((items.reduce((s, i) => s + i.priceCents * i.quantity, 0) * discount.value) / 100) : discount.value) + shippingCents;
  const total = subtotal - disc + ship;
  const results = useMemo(() => (q.trim() ? variants.filter((v) => `${v.title} ${v.variant}`.toLowerCase().includes(q.toLowerCase()) && !added.some((a) => a.variantId === v.id)).slice(0, 8) : []), [q, variants, added]);

  const save = () => start(async () => {
    setError(null);
    const res = await saveOrderEdit({ orderId, lines: [...items.map((i) => ({ itemId: i.id, quantity: qty[i.id] ?? 0 })), ...added], shipping, resend });
    if (res?.error) setError(res.error);
  });

  const row = (key: string, title: string, variant: string, image: string | null, hue: number, price: number, value: number, set: (n: number) => void, isNew = false) => (
    <li key={key} className={`flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 ${value === 0 ? "opacity-50" : ""}`}>
      <Thumb image={image} hue={hue} title={title} className="h-10 w-10 text-[10px]" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-[550]">{title}{isNew && <span className="ml-2 rounded-md bg-[#cdfee1] px-1.5 text-[11px] text-[#0c5132]">Ajouté</span>}{value === 0 && <span className="ml-2 rounded-md bg-[#fedad9] px-1.5 text-[11px] text-[#8e0b21]">Retiré</span>}</div>
        <div className="text-xs text-muted">{variant !== "Par défaut" ? `${variant} · ` : ""}{m(price)}</div>
      </div>
      <input type="number" min={0} max={9999} value={value} onChange={(e) => set(Math.max(0, Math.floor(Number(e.target.value) || 0)))} aria-label={`Quantité ${title}`} className="input num w-20" />
      <span className="num w-20 text-right">{m(price * value)}</span>
    </li>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <section className="card min-w-0 overflow-visible">
        <div className="card-h"><h2 className="text-sm font-[650]">Articles</h2></div>
        <div className="relative px-4 pb-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ajouter un produit" aria-label="Ajouter un produit à la commande" className="input" />
          {results.length > 0 && (
            <ul className="absolute inset-x-4 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl bg-white p-1 shadow-[0_4px_16px_rgba(0,0,0,.15),0_0_0_1px_rgba(0,0,0,.06)]">
              {results.map((v) => (
                <li key={v.id}><button type="button" onClick={() => { setAdded((a) => [...a, { variantId: v.id, quantity: 1 }]); setQ(""); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[#f1f1f1]">
                  <Thumb image={v.image} hue={v.hue} title={v.title} className="h-8 w-8 text-[9px]" />
                  <span className="min-w-0 flex-1"><span className="block truncate">{v.title}{v.variant !== "Par défaut" ? ` · ${v.variant}` : ""}</span><span className="text-xs text-muted">{v.stock} en stock · {m(v.priceCents)}</span></span>
                </button></li>
              ))}
            </ul>
          )}
        </div>
        <ul className="border-t border-line">
          {items.map((i) => row(i.id, i.title, i.variant, i.image, i.hue, i.priceCents, qty[i.id] ?? 0, (n) => setQty({ ...qty, [i.id]: n })))}
          {added.map((a) => { const v = variants.find((x) => x.id === a.variantId)!; return row(`new-${a.variantId}`, v.title, v.variant, v.image, v.hue, v.priceCents, a.quantity, (n) => setAdded((list) => (n === 0 ? list.filter((x) => x.variantId !== a.variantId) : list.map((x) => (x.variantId === a.variantId ? { ...x, quantity: n } : x)))), true); })}
        </ul>
      </section>
      <aside className="flex flex-col gap-4">
        <section className="card flex flex-col gap-2 p-4">
          <h2 className="text-sm font-[650]">Récapitulatif</h2>
          <dl className="grid grid-cols-[1fr_auto] items-center gap-y-1.5 text-[13px]">
            <dt className="text-muted">Sous-total</dt><dd className="num text-right">{m(subtotal)}</dd>
            {discount.kind !== "none" && <><dt className="text-muted">Remise{discount.kind === "percent" ? ` (${discount.value} %)` : ""}</dt><dd className="num text-right">−{m(disc)}</dd></>}
            <dt className="text-muted">Livraison</dt><dd><input inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} aria-label="Frais de livraison" className="input num h-7 w-24 py-1 text-right" /></dd>
            <dt className="font-[650]">Nouveau total</dt><dd className="num text-right font-[650]">{m(total)}</dd>
            <dt className="text-xs text-muted">Avant modification</dt><dd className="num text-right text-xs text-muted">{m(oldTotal)}</dd>
          </dl>
        </section>
        <label className="flex items-center gap-2 px-1 text-[13px]"><input type="checkbox" checked={resend} onChange={(e) => setResend(e.target.checked)} className="h-4 w-4 accent-[#7c3aed]" />Envoyer la facture mise à jour au client</label>
        {error && <p role="alert" className="text-[13px] text-[#8e0b21]">{error}</p>}
        <button type="button" onClick={save} disabled={pending} className="btn btn-primary h-9">{pending ? "Enregistrement…" : "Mettre à jour la commande"}</button>
      </aside>
    </div>
  );
}
