"use client";

import { useActionState, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createDiscount } from "@/app/admin/discounts/actions";
import { keepOnSubmit } from "@/lib/keep-form";
import { COUNTRIES } from "@/lib/countries";

type Option = { id: string; title: string; hint?: string };
type Type = "percent" | "fixed" | "free_shipping" | "bxgy";
type Eligibility = "all" | "segments" | "customers";

/** Liste de cases à cocher avec recherche (collections, produits, segments, clients, pays). */
function Picker({ options, selected, onToggle, placeholder }: { options: Option[]; selected: string[]; onToggle: (id: string) => void; placeholder: string }) {
  const [q, setQ] = useState("");
  const shown = options.filter((o) => `${o.title} ${o.hint ?? ""}`.toLowerCase().includes(q.toLowerCase())).slice(0, 50);
  return (
    <div className="rounded-lg border border-line">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Rechercher" className="input rounded-b-none border-0 border-b border-line" />
      <ul className="max-h-44 overflow-y-auto p-1">
        {shown.map((o) => (
          <li key={o.id}><label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[13px] hover:bg-[#f7f7f7]"><input type="checkbox" checked={selected.includes(o.id)} onChange={() => onToggle(o.id)} className="h-4 w-4 accent-[#7c3aed]" /><span className="min-w-0 truncate">{o.title}{o.hint && <span className="text-muted"> · {o.hint}</span>}</span></label></li>
        ))}
        {!shown.length && <li className="px-2 py-1 text-xs text-muted">Aucun résultat.</li>}
      </ul>
      <p className="border-t border-line px-3 py-1.5 text-xs text-muted">{selected.length} sélectionné{selected.length > 1 ? "s" : ""}</p>
    </div>
  );
}

export function DiscountForm({ currency, collections, products, segments = [], customers = [] }: { currency: string; collections: Option[]; products: Option[]; segments?: Option[]; customers?: Option[] }) {
  const [state, action, pending] = useActionState(createDiscount, undefined);
  const [method, setMethod] = useState<"code" | "automatic">("code");
  const [type, setType] = useState<Type>("percent");
  const [appliesTo, setAppliesTo] = useState<"all" | "collections" | "products">("all");
  const [targets, setTargets] = useState<string[]>([]);
  const [minReq, setMinReq] = useState<"none" | "amount" | "quantity">("none");
  const [eligibility, setEligibility] = useState<Eligibility>("all");
  const [eligible, setEligible] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) { ref.current?.reset(); setTargets([]); setAppliesTo("all"); setType("percent"); setMethod("code"); setMinReq("none"); setEligibility("all"); setEligible([]); setCountries([]); } }, [state]);

  const list = appliesTo === "collections" ? collections : products;
  const toggleIn = (set: Dispatch<SetStateAction<string[]>>) => (id: string) => set((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  const toggle = toggleIn(setTargets);

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
            <select name="appliesTo" className="input" value={appliesTo} onChange={(e) => { setAppliesTo(e.target.value as typeof appliesTo); setTargets([]); }}>
              <option value="all">Tout le panier</option>
              <option value="collections" disabled={!collections.length}>Certaines collections</option>
              <option value="products" disabled={!products.length}>Certains produits</option>
            </select>
          </label>
          {appliesTo !== "all" && <Picker key={appliesTo} options={list} selected={targets} onToggle={toggle} placeholder={appliesTo === "collections" ? "Rechercher une collection" : "Rechercher un produit"} />}
          <input type="hidden" name="targetIds" value={JSON.stringify(targets)} />
        </div>
      )}

      {type === "free_shipping" && (
        <div className="flex flex-col gap-2">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-[13px]">Pays</legend>
            <label className="flex items-center gap-2 text-[13px]"><input type="radio" name="countryScope" checked={!countries.length} onChange={() => setCountries([])} className="accent-[#7c3aed]" />Tous les pays</label>
            <label className="flex items-center gap-2 text-[13px]"><input type="radio" name="countryScope" checked={countries.length > 0} onChange={() => setCountries(countries.length ? countries : ["France"])} className="accent-[#7c3aed]" />Certains pays</label>
          </fieldset>
          {countries.length > 0 && <Picker options={COUNTRIES.map((c) => ({ id: c, title: c }))} selected={countries} onToggle={toggleIn(setCountries)} placeholder="Rechercher un pays" />}
          <input type="hidden" name="countries" value={JSON.stringify(countries)} />
        </div>
      )}

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-[13px]">Exigences minimales d'achat</legend>
        {([["none", "Aucune exigence minimale"], ["amount", "Montant d'achat minimum"], ["quantity", "Quantité minimale d'articles"]] as const).map(([v, l]) => (
          <label key={v} className="flex items-center gap-2 text-[13px]"><input type="radio" name="minRequirement" value={v} checked={minReq === v} onChange={() => setMinReq(v)} className="accent-[#7c3aed]" />{l}</label>
        ))}
        {minReq === "amount" && <input id="d-min" name="minSubtotal" required className="input num" inputMode="decimal" placeholder="0,00" aria-label={`Montant minimum (${currency})`} />}
        {minReq === "quantity" && <input id="d-min-qty" name="minQuantity" required type="number" min={1} max={999} className="input num" placeholder="4" aria-label="Quantité minimale d'articles" />}
        {minReq !== "none" && type !== "free_shipping" && appliesTo !== "all" && <p className="text-xs text-muted">Seuls les articles concernés par la remise comptent.</p>}
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-[13px]">Admissibilité des clients</legend>
        {([["all", "Tous les clients"], ["segments", "Segments de clients spécifiques"], ["customers", "Clients spécifiques"]] as const).map(([v, l]) => (
          <label key={v} className="flex items-center gap-2 text-[13px]"><input type="radio" name="eligibility" value={v} checked={eligibility === v} onChange={() => { setEligibility(v); setEligible([]); }} disabled={(v === "segments" && !segments.length) || (v === "customers" && !customers.length)} className="accent-[#7c3aed]" />{l}</label>
        ))}
        {eligibility === "segments" && <Picker key="segments" options={segments} selected={eligible} onToggle={toggleIn(setEligible)} placeholder="Rechercher un segment" />}
        {eligibility === "customers" && <Picker key="customers" options={customers} selected={eligible} onToggle={toggleIn(setEligible)} placeholder="Rechercher un client (nom ou e-mail)" />}
        {eligibility !== "all" && <p className="text-xs text-muted">Le client doit être connecté à son compte pour en profiter.</p>}
        <input type="hidden" name="eligibleIds" value={JSON.stringify(eligible)} />
      </fieldset>
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
      <label className="flex items-start gap-2 text-[13px]">
        <input type="checkbox" name="combinesWithShipping" className="mt-0.5 h-4 w-4 accent-[#7c3aed]" />
        <span>{type === "free_shipping" ? "Cumulable avec une remise sur les produits" : "Cumulable avec une livraison offerte"}<span className="block text-xs text-muted">Les deux remises s'appliquent ensemble si chacune l'autorise (ex. : code -10 % et livraison offerte automatique).</span></span>
      </label>
      {state?.error && <p role="alert" className="text-sm font-semibold text-red-700">{state.error}</p>}
      {state?.ok && <p role="status" className="text-[13px] font-[550] text-[#0c5132]">Remise créée.</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Création…" : "Créer la remise"}</button>
    </form>
  );
}
