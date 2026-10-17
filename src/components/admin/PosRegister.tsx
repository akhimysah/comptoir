"use client";

import { useMemo, useState, useTransition } from "react";
import { posCheckout } from "@/app/admin/pos/actions";
import { Thumb } from "@/components/ui";
import { formatMoney, parseMoney } from "@/lib/money";

type V = { id: string; title: string; priceCents: number; stock: number; unlimited: boolean; stockAt?: Record<string, number> };
type P = { id: string; title: string; image: string | null; hue: number; collections: string[]; variants: V[] };
type Line = { variantId: string; quantity: number };

export function PosRegister({ products: allProducts, collections, customers, currency, locations = [] }: { products: P[]; collections: { handle: string; title: string }[]; customers: { email: string; name: string }[]; currency: string; locations?: { id: string; name: string }[] }) {
  // Plusieurs emplacements : la caisse vend le stock de l'emplacement choisi (gardé d'une session à l'autre).
  const [loc, setLoc] = useState(() => { try { const v = localStorage.getItem("comptoir:pos:location"); return v && locations.some((l) => l.id === v) ? v : locations[0]?.id ?? ""; } catch { return locations[0]?.id ?? ""; } });
  const products = useMemo(() => (locations.length > 1 ? allProducts.map((p) => ({ ...p, variants: p.variants.map((v) => ({ ...v, stock: v.stockAt?.[loc] ?? 0 })) })) : allProducts), [allProducts, locations.length, loc]);
  const [q, setQ] = useState("");
  const [col, setCol] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [picker, setPicker] = useState<P | null>(null);
  const [discount, setDiscount] = useState("");
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pay, setPay] = useState<"cash" | "card" | null>(null);
  const [given, setGiven] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ orderId: string; number: number; change: number; total: number } | null>(null);
  const [pending, start] = useTransition();
  const m = (c: number) => formatMoney(c, currency);

  const variantOf = (id: string) => { for (const p of products) { const v = p.variants.find((x) => x.id === id); if (v) return { p, v }; } return null; };
  const shown = useMemo(() => products.filter((p) => (!col || p.collections.includes(col)) && p.title.toLowerCase().includes(q.toLowerCase())), [products, q, col]);
  const subtotal = lines.reduce((s, l) => s + (variantOf(l.variantId)?.v.priceCents ?? 0) * l.quantity, 0);
  const discountCents = discountType === "percent" ? Math.round((subtotal * Math.min(100, Number(discount.replace(",", ".")) || 0)) / 100) : Math.min(subtotal, parseMoney(discount) ?? 0);
  const total = subtotal - discountCents;
  const givenCents = parseMoney(given) ?? 0;
  const change = givenCents - total;

  const add = (variantId: string) => {
    setLines((ls) => (ls.some((l) => l.variantId === variantId) ? ls.map((l) => (l.variantId === variantId ? { ...l, quantity: l.quantity + 1 } : l)) : [...ls, { variantId, quantity: 1 }]));
    setPicker(null);
  };
  const reset = () => { setLines([]); setDiscount(""); setEmail(""); setName(""); setPay(null); setGiven(""); setError(null); setDone(null); };
  const charge = () => start(async () => {
    setError(null);
    const res = await posCheckout({ lines, discountCents, method: pay!, email, name, locationId: loc || undefined });
    if (res.error) setError(res.error);
    else setDone({ orderId: res.orderId!, number: res.number!, change: pay === "cash" ? Math.max(0, change) : 0, total });
  });

  if (done) {
    return (
      <div className="card mx-auto flex max-w-md flex-col items-center gap-3 p-8 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-[#cdfee1] text-2xl text-[#0c5132]">✓</div>
        <h2 className="text-lg font-bold">Vente #{done.number} encaissée</h2>
        <p className="text-muted">{m(done.total)}{done.change > 0 ? ` · rendu monnaie ${m(done.change)}` : ""}</p>
        {done.change > 0 && <div className="rounded-xl bg-[#f1f1f1] px-6 py-3 text-2xl font-bold tabular-nums">À rendre : {m(done.change)}</div>}
        <div className="mt-2 flex gap-2">
          <a href={`/print/receipt/${done.orderId}`} target="_blank" className="btn">Imprimer le ticket</a>
          <button className="btn btn-primary" onClick={reset}>Nouvelle vente</button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <section className="flex min-w-0 flex-col gap-3">
        {locations.length > 1 && (
          <label className="flex items-center gap-2 text-[13px]">Emplacement
            <select value={loc} onChange={(e) => { setLoc(e.target.value); setLines([]); try { localStorage.setItem("comptoir:pos:location", e.target.value); } catch {} }} className="input h-8 w-auto py-1">{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          </label>
        )}
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un produit" aria-label="Rechercher un produit" className="input h-10 text-base" />
        <div className="flex flex-wrap gap-1.5">
          <button className={`btn btn-sm ${!col ? "bg-[#e3e3e3]" : ""}`} onClick={() => setCol(null)}>Tout</button>
          {collections.map((c) => <button key={c.handle} className={`btn btn-sm ${col === c.handle ? "bg-[#e3e3e3]" : ""}`} onClick={() => setCol(c.handle)}>{c.title}</button>)}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {shown.map((p) => {
            const stock = p.variants.reduce((s, v) => s + Math.max(0, v.stock), 0);
            const unlimited = p.variants.some((v) => v.unlimited);
            return (
              <button key={p.id} disabled={!unlimited && stock <= 0} onClick={() => (p.variants.length === 1 ? add(p.variants[0].id) : setPicker(p))} className="card flex flex-col overflow-hidden text-left transition hover:shadow-[0_0_0_2px_#303030] disabled:opacity-40">
                <Thumb image={p.image} hue={p.hue} title={p.title} rounded="" className="aspect-[4/3] w-full text-xl" />
                <span className="flex flex-col p-2.5">
                  <span className="truncate text-[13px] font-[550]">{p.title}</span>
                  <span className="flex justify-between text-xs text-muted"><span>{m(Math.min(...p.variants.map((v) => v.priceCents)))}</span><span>{unlimited ? "∞" : stock}</span></span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <aside className="card flex flex-col self-start lg:sticky lg:top-20">
        <div className="card-h"><h2 className="text-sm font-[650]">Ticket</h2>{lines.length > 0 && <button className="text-xs text-pine hover:underline" onClick={reset}>Vider</button>}</div>
        <ul className="max-h-[40vh] overflow-y-auto">
          {lines.map((l) => {
            const x = variantOf(l.variantId)!;
            const max = x.v.unlimited ? 999 : x.v.stock;
            return (
              <li key={l.variantId} className="flex items-center gap-2 border-b border-line px-3 py-2">
                <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-[550]">{x.p.title}</span>{x.v.title !== "Par défaut" && <span className="text-xs text-muted">{x.v.title}</span>}</span>
                <span className="inline-flex items-center rounded-lg border border-line">
                  <button className="h-7 w-7" aria-label="Moins" onClick={() => setLines((ls) => ls.map((y) => (y.variantId === l.variantId ? { ...y, quantity: y.quantity - 1 } : y)).filter((y) => y.quantity > 0))}>−</button>
                  <span className="w-6 text-center text-[13px] tabular-nums">{l.quantity}</span>
                  <button className="h-7 w-7 disabled:opacity-30" aria-label="Plus" disabled={l.quantity >= max} onClick={() => setLines((ls) => ls.map((y) => (y.variantId === l.variantId ? { ...y, quantity: y.quantity + 1 } : y)))}>+</button>
                </span>
                <span className="w-16 text-right text-[13px] tabular-nums">{m(x.v.priceCents * l.quantity)}</span>
              </li>
            );
          })}
          {!lines.length && <li className="px-3 py-8 text-center text-[13px] text-muted">Touchez un produit pour l'ajouter.</li>}
        </ul>
        <div className="flex flex-col gap-2 border-t border-line p-3">
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[13px]">Remise</span>
            <input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0" aria-label="Remise" className="input num h-7 w-20 py-1 text-right" />
            <select value={discountType} onChange={(e) => setDiscountType(e.target.value as "amount" | "percent")} aria-label="Type de remise" className="input h-7 w-16 py-0"><option value="amount">€</option><option value="percent">%</option></select>
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-[13px]">
            <dt className="text-muted">Sous-total</dt><dd className="text-right tabular-nums">{m(subtotal)}</dd>
            {discountCents > 0 && <><dt className="text-muted">Remise</dt><dd className="text-right tabular-nums">−{m(discountCents)}</dd></>}
            <dt className="text-base font-bold">Total</dt><dd className="text-right text-base font-bold tabular-nums">{m(total)}</dd>
          </dl>
          <details className="text-[13px]">
            <summary className="cursor-pointer text-pine">Client (optionnel, pour le reçu par e-mail)</summary>
            <div className="mt-2 flex flex-col gap-1.5">
              <input list="pos-customers" value={email} onChange={(e) => { setEmail(e.target.value); const c = customers.find((x) => x.email === e.target.value); if (c) setName(c.name); }} placeholder="E-mail" aria-label="E-mail du client" className="input h-8" />
              <datalist id="pos-customers">{customers.map((c) => <option key={c.email} value={c.email}>{c.name}</option>)}</datalist>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" aria-label="Nom du client" className="input h-8" />
            </div>
          </details>
          <div className="grid grid-cols-2 gap-2">
            <button className={`btn h-10 ${pay === "cash" ? "bg-[#e3e3e3]" : ""}`} disabled={!lines.length} onClick={() => setPay("cash")}>Espèces</button>
            <button className={`btn h-10 ${pay === "card" ? "bg-[#e3e3e3]" : ""}`} disabled={!lines.length} onClick={() => setPay("card")}>Carte</button>
          </div>
          {pay === "cash" && (
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-[13px]"><span className="flex-1">Montant reçu</span><input autoFocus value={given} onChange={(e) => setGiven(e.target.value)} inputMode="decimal" aria-label="Montant reçu" className="input num h-8 w-24 text-right" /></label>
              <div className="flex flex-wrap gap-1">{[total, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000, Math.ceil(total / 5000) * 5000].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => <button key={v} className="btn btn-sm" onClick={() => setGiven((v / 100).toFixed(2).replace(".", ","))}>{m(v)}</button>)}</div>
              {given && <div className={`text-right text-[13px] font-[650] ${change < 0 ? "text-[#8e0b21]" : ""}`}>{change < 0 ? `Il manque ${m(-change)}` : `À rendre : ${m(change)}`}</div>}
            </div>
          )}
          {pay === "card" && <p className="text-xs text-muted">Encaissez sur votre terminal de paiement, puis validez.</p>}
          {error && <p role="alert" className="text-[13px] text-[#8e0b21]">{error}</p>}
          <button className="btn btn-primary h-11 text-base" disabled={pending || !lines.length || !pay || (pay === "cash" && change < 0)} onClick={charge}>{pending ? "Encaissement…" : `Encaisser ${m(total)}`}</button>
        </div>
      </aside>

      {picker && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setPicker(null)}>
          <div className="card w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Choisir : ${picker.title}`}>
            <h3 className="mb-3 text-sm font-[650]">{picker.title}</h3>
            <div className="grid grid-cols-2 gap-2">
              {picker.variants.map((v) => <button key={v.id} disabled={!v.unlimited && v.stock <= 0} className="btn h-auto flex-col py-2 disabled:opacity-40" onClick={() => add(v.id)}><span>{v.title}</span><span className="text-xs text-muted">{m(v.priceCents)} · {v.unlimited ? "∞" : v.stock}</span></button>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
