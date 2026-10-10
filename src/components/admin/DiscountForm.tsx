"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createDiscount } from "@/app/admin/discounts/actions";
import { keepOnSubmit } from "@/lib/keep-form";

type Option = { id: string; title: string };
type Type = "percent" | "fixed" | "free_shipping" | "bxgy";

export function DiscountForm({ currency, collections, products }: { currency: string; collections: Option[]; products: Option[] }) {
  const [state, action, pending] = useActionState(createDiscount, undefined);
  const [method, setMethod] = useState<"code" | "automatic">("code");
  const [type, setType] = useState<Type>("percent");
  const [appliesTo, setAppliesTo] = useState<"all" | "collections" | "products">("all");
  const [targets, setTargets] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) { ref.current?.reset(); setTargets([]); setAppliesTo("all"); setType("percent"); setMethod("code"); } }, [state]);

  const list = appliesTo === "collections" ? collections : products;
  const shown = list.filter((o) => o.title.toLowerCase().includes(q.toLowerCase())).slice(0, 50);
  const toggle = (id: string) => setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  return (
    <form ref={ref} onSubmit={keepOnSubmit(action)} className="card flex flex-col gap-4 p-5">
      <h2 className="text-sm font-[650]">Nouvelle remise</h2>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-[13px]">Méthode</legend>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#f1f1f1] p-1 text-[13px] font-[550]">
          {(["code", "automatic"] as const).map((m) => (
            <label key={m} className={`cursor-pointer rounded-md px-2 py-1.5 text-center ${method === m ? "bg-white shadow-sm" : "text-muted"}`}>
              <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} className="sr-only" />
              {m === "code" ? "Code promo" : "Automatique"}
            </label>
          ))}
        </div>
      </fieldset>
      {method === "code"
        ? <label className="label">Code<input id="d-code" name="code" required className="input uppercase" placeholder="BIENVENUE10" maxLength={30} /></label>
        : <label className="label">Nom affiché au client<input id="d-title" name="title" required className="input" placeholder="Soldes d'été" maxLength={60} /></label>}

      <label className="label">Type de remise
        <select id="d-type" name="type" className="input" value={type} onChange={(e) => setType(e.target.value as Type)}>
          <option value="percent">Pourcentage</option>
          <option value="fixed">Montant fixe</option>
          <option value="bxgy">Achetez X, obtenez Y</option>
          <option value="free_shipping">Livraison offerte</option>
        </select>
      </label>

      {type === "bxgy" ? (
        <div className="grid grid-cols-3 gap-2">
          <label className="label">Achetés<input name="buyQty" type="number" min={1} max={20} defaultValue={2} className="input num" /></label>
          <label className="label">Obtenus<input name="getQty" type="number" min={1} max={20} defaultValue={1} className="input num" /></label>
          <label className="label">Réduction<select name="value" defaultValue="100" className="input"><option value="100">Offerts</option><option value="50">−50 %</option><option value="30">−30 %</option><option value="20">−20 %</option></select></label>
          <p className="col-span-3 text-xs text-muted">Dans chaque lot, ce sont les articles les moins chers qui sont offerts ou réduits.</p>
        </div>
      ) : type === "free_shipping" ? <input type="hidden" name="value" value="0" /> : (
        <label className="label">{type === "percent" ? "Réduction (%)" : `Réduction (${currency})`}<input id="d-value" name="value" required className="input num" inputMode="decimal" placeholder={type === "percent" ? "10" : "5,00"} /></label>
      )}

      {type !== "free_shipping" && (
        <div className="flex flex-col gap-2">
          <label className="label">S'applique à
            <select name="appliesTo" className="input" value={appliesTo} onChange={(e) => { setAppliesTo(e.target.value as typeof appliesTo); setTargets([]); setQ(""); }}>
              <option value="all">Tout le panier</option>
              <option value="collections" disabled={!collections.length}>Certaines collections</option>
              <option value="products" disabled={!products.length}>Certains produits</option>
            </select>
          </label>
          {appliesTo !== "all" && (
            <div className="rounded-lg border border-line">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={appliesTo === "collections" ? "Rechercher une collection" : "Rechercher un produit"} aria-label="Rechercher" className="input rounded-b-none border-0 border-b border-line" />
              <ul className="max-h-44 overflow-y-auto p-1">
                {shown.map((o) => (
                  <li key={o.id}><label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[13px] hover:bg-[#f7f7f7]"><input type="checkbox" checked={targets.includes(o.id)} onChange={() => toggle(o.id)} className="h-4 w-4 accent-[#7c3aed]" />{o.title}</label></li>
                ))}
              </ul>
              <p className="border-t border-line px-3 py-1.5 text-xs text-muted">{targets.length} sélectionné{targets.length > 1 ? "s" : ""}</p>
            </div>
          )}
          <input type="hidden" name="targetIds" value={JSON.stringify(targets)} />
        </div>
      )}

      <label className="label">Montant minimum du panier<span className="hint">Optionnel.</span><input id="d-min" name="minSubtotal" className="input num" inputMode="decimal" placeholder="0,00" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="label">Début<input name="startsAt" type="date" className="input" /></label>
        <label className="label">Fin<input id="d-ends" name="endsAt" type="date" className="input" /></label>
      </div>
      {method === "code" && (
        <div className="grid grid-cols-2 items-end gap-3">
          <label className="label">Utilisations max<input id="d-limit" name="usageLimit" type="number" min={1} className="input num" placeholder="Illimité" /></label>
          <label className="flex items-center gap-2 pb-2 text-[13px]"><input type="checkbox" name="oncePerCustomer" className="h-4 w-4 accent-[#7c3aed]" />Une fois par client</label>
        </div>
      )}
      {state?.error && <p role="alert" className="text-sm font-semibold text-red-700">{state.error}</p>}
      {state?.ok && <p role="status" className="text-[13px] font-[550] text-[#0c5132]">Remise créée.</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Création…" : "Créer la remise"}</button>
    </form>
  );
}
