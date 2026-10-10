"use client";

import { useMemo, useState, useTransition } from "react";
import { createManualOrder } from "@/app/admin/orders/new/actions";
import { Thumb } from "@/components/ui";
import { formatMoney, parseMoney } from "@/lib/money";

export type PickVariant = { id: string; productTitle: string; variantTitle: string; priceCents: number; stock: number; image: string | null; hue: number };
export type PickCustomer = { id: string; name: string; email: string; address: { line1: string; zip: string; city: string; country: string } | null };

export function ManualOrderForm({ variants, customers, currency }: { variants: PickVariant[]; customers: PickCustomer[]; currency: string }) {
  const [lines, setLines] = useState<{ variantId: string; quantity: number }[]>([]);
  const [q, setQ] = useState("");
  const [cq, setCq] = useState("");
  const [c, setC] = useState({ name: "", email: "", line1: "", zip: "", city: "", country: "France" });
  const [shipping, setShipping] = useState("0");
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState<"paid" | "pending" | "invoice">("paid");
  const [discount, setDiscount] = useState("0");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const m = (x: number) => formatMoney(x, currency);

  const results = useMemo(() => (q.trim() ? variants.filter((v) => `${v.productTitle} ${v.variantTitle}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : []), [q, variants]);
  const custResults = useMemo(() => (cq.trim() ? customers.filter((x) => `${x.name} ${x.email}`.toLowerCase().includes(cq.toLowerCase())).slice(0, 6) : []), [cq, customers]);
  const subtotal = lines.reduce((s, l) => s + (variants.find((v) => v.id === l.variantId)?.priceCents ?? 0) * l.quantity, 0);
  const ship = parseMoney(shipping) ?? 0;
  const disc = Math.min(subtotal, parseMoney(discount) ?? 0);

  const add = (id: string) => { setLines((ls) => (ls.some((l) => l.variantId === id) ? ls.map((l) => (l.variantId === id ? { ...l, quantity: l.quantity + 1 } : l)) : [...ls, { variantId: id, quantity: 1 }])); setQ(""); };
  const submit = () => start(async () => { setError(null); const res = await createManualOrder({ lines, ...c, shipping, note, paid: payment === "paid", discount, invoice: payment === "invoice", message }); if (res?.error) setError(res.error); });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-[650]">Produits</h2>
          <div className="relative">
            <input id="mo-search" className="input" placeholder="Rechercher des produits" value={q} onChange={(e) => setQ(e.target.value)} />
            {results.length > 0 && (
              <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-xl bg-white p-1 shadow-[0_4px_16px_rgba(0,0,0,.15),0_0_0_1px_rgba(0,0,0,.06)]">
                {results.map((v) => (
                  <li key={v.id}>
                    <button type="button" onClick={() => add(v.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-[#f1f1f1]">
                      <Thumb image={v.image} hue={v.hue} title={v.productTitle} className="h-8 w-8 text-[10px]" />
                      <span className="flex-1"><span className="font-[550]">{v.productTitle}</span>{v.variantTitle !== "Par défaut" && <span className="text-muted"> · {v.variantTitle}</span>}</span>
                      <span className="text-xs text-muted">{v.stock} dispo.</span>
                      <span className="num">{m(v.priceCents)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {lines.length > 0 && (
            <ul className="mt-3 rounded-lg border border-line">
              {lines.map((l) => {
                const v = variants.find((x) => x.id === l.variantId)!;
                return (
                  <li key={l.variantId} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0">
                    <Thumb image={v.image} hue={v.hue} title={v.productTitle} className="h-9 w-9 text-[10px]" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-[550]">{v.productTitle}</span>{v.variantTitle !== "Par défaut" && <span className="text-xs text-muted">{v.variantTitle}</span>}</span>
                    <input aria-label="Quantité" type="number" min={1} value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x) => (x.variantId === l.variantId ? { ...x, quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) } : x)))} className="input num w-16" />
                    <span className="num w-20 text-right">{m(v.priceCents * l.quantity)}</span>
                    <button type="button" aria-label="Retirer" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-[#f1f1f1]" onClick={() => setLines((ls) => ls.filter((x) => x.variantId !== l.variantId))}>✕</button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-[650]">Paiement</h2>
          <dl className="grid grid-cols-[1fr_auto] items-center gap-y-2 rounded-lg border border-line p-3">
            <dt>Sous-total</dt><dd className="num text-right">{m(subtotal)}</dd>
            <dt>Remise</dt><dd className="text-right"><input id="mo-discount" aria-label="Remise" inputMode="decimal" className="input num h-7 w-24 py-1 text-right" value={discount} onChange={(e) => setDiscount(e.target.value)} /></dd>
            <dt>Expédition</dt><dd className="text-right"><input id="mo-shipping" aria-label="Frais d'expédition" inputMode="decimal" className="input num h-7 w-24 py-1 text-right" value={shipping} onChange={(e) => setShipping(e.target.value)} /></dd>
            <dt className="font-[650]">Total</dt><dd className="num text-right font-[650]">{m(subtotal - disc + ship)}</dd>
          </dl>
          <fieldset className="mt-3 flex flex-col gap-1.5">
            <label className="flex items-center gap-2"><input type="radio" name="paid" checked={payment === "paid"} onChange={() => setPayment("paid")} className="accent-[#7c3aed]" />Le client a déjà payé (espèces, virement…)</label>
            <label className="flex items-center gap-2"><input type="radio" name="paid" checked={payment === "invoice"} onChange={() => setPayment("invoice")} className="accent-[#7c3aed]" />Envoyer une facture avec un lien de paiement par carte</label>
            <label className="flex items-center gap-2"><input type="radio" name="paid" checked={payment === "pending"} onChange={() => setPayment("pending")} className="accent-[#7c3aed]" />Paiement en attente</label>
            {payment === "invoice" && <textarea aria-label="Message joint à la facture" className="input mt-1 min-h-[60px]" maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message joint à la facture (facultatif)" />}
          </fieldset>
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        <section className="card flex flex-col gap-2 p-4">
          <h2 className="text-sm font-[650]">Client</h2>
          <div className="relative">
            <input id="mo-customer-search" className="input" placeholder="Rechercher un client existant" value={cq} onChange={(e) => setCq(e.target.value)} />
            {custResults.length > 0 && (
              <ul className="absolute inset-x-0 top-full z-10 mt-1 rounded-xl bg-white p-1 shadow-[0_4px_16px_rgba(0,0,0,.15),0_0_0_1px_rgba(0,0,0,.06)]">
                {custResults.map((x) => (
                  <li key={x.id}><button type="button" className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-[#f1f1f1]" onClick={() => { setC({ name: x.name, email: x.email, ...(x.address ?? { line1: "", zip: "", city: "", country: "France" }) }); setCq(""); }}><span className="font-[550]">{x.name}</span><span className="block text-xs text-muted">{x.email}</span></button></li>
                ))}
              </ul>
            )}
          </div>
          <input id="mo-name" aria-label="Nom" className="input" placeholder="Nom complet" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
          <input id="mo-email" aria-label="E-mail" type="email" className="input" placeholder="E-mail" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} />
          <h3 className="mt-2 text-[13px] font-[650]">Adresse d'expédition</h3>
          <input id="mo-line1" aria-label="Adresse" className="input" placeholder="Adresse" value={c.line1} onChange={(e) => setC({ ...c, line1: e.target.value })} />
          <div className="grid grid-cols-[1fr_1.4fr] gap-2">
            <input id="mo-zip" aria-label="Code postal" className="input" placeholder="Code postal" value={c.zip} onChange={(e) => setC({ ...c, zip: e.target.value })} />
            <input id="mo-city" aria-label="Ville" className="input" placeholder="Ville" value={c.city} onChange={(e) => setC({ ...c, city: e.target.value })} />
          </div>
          <input id="mo-country" aria-label="Pays" className="input" value={c.country} onChange={(e) => setC({ ...c, country: e.target.value })} />
        </section>
        <section className="card flex flex-col gap-2 p-4">
          <h2 className="text-sm font-[650]">Notes</h2>
          <textarea id="mo-note" className="input min-h-[70px]" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </section>
        {error && <p role="alert" className="rounded-lg bg-[#fedad9] px-3 py-2 text-[13px] text-[#8e0b21]">{error}</p>}
        <button className="btn btn-primary h-9" disabled={pending || !lines.length} onClick={submit}>{pending ? "Création…" : "Créer la commande"}</button>
      </aside>
    </div>
  );
}
