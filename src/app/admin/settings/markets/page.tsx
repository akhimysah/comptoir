import { deleteMarket, saveMarket, toggleMarket } from "./actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { MARKET_COLORS, WorldMap } from "@/components/admin/WorldMap";
import { PageHeader, Pill } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { COUNTRIES } from "@/lib/countries";
import { storeCurrencies } from "@/lib/currency";
import { db } from "@/lib/db";
import { LOCALES } from "@/lib/i18n";
import { storeLocales } from "@/lib/locale";
import { marketCountries } from "@/lib/markets";

export const metadata = { title: "Marchés" };

function MarketForm({ m, currencies, locales }: { m: { id: string; name: string; countries: string[]; currency: string; locale: string; priceAdjustBps: number; enabled: boolean } | null; currencies: string[]; locales: string[] }) {
  return (
    <form action={saveMarket} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={m?.id ?? ""} />
      <input type="hidden" name="enabled" value={m ? (m.enabled ? "on" : "off") : "on"} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="label">Nom<input name="name" defaultValue={m?.name ?? ""} required maxLength={60} placeholder="Europe" className="input" /></label>
        <label className="label">Devise<select name="currency" defaultValue={m?.currency ?? ""} className="input"><option value="">Devise de la boutique</option>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="label">Langue<select name="locale" defaultValue={m?.locale ?? ""} className="input"><option value="">Langue principale</option>{locales.map((l) => <option key={l} value={l}>{LOCALES[l as keyof typeof LOCALES]}</option>)}</select></label>
      </div>
      <label className="label">Ajustement des prix (%) <span className="hint">+5 pour vendre 5 % plus cher sur ce marché, −10 pour 10 % moins cher. 0 = prix de la boutique. Les cartes cadeaux ne changent pas.</span><input name="adjust" defaultValue={m ? (m.priceAdjustBps / 100).toLocaleString("fr-FR") : "0"} inputMode="decimal" className="input num w-32" /></label>
      <fieldset>
        <legend className="mb-1 text-[13px]">Pays</legend>
        <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-3">
          {COUNTRIES.map((c) => <label key={c} className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="countries" value={c} defaultChecked={m?.countries.includes(c)} className="h-4 w-4 accent-[#7c3aed]" />{c}</label>)}
        </div>
      </fieldset>
      <button className="btn btn-primary self-end">{m ? "Enregistrer" : "Créer le marché"}</button>
    </form>
  );
}

/** Marchés, comme sur Shopify : des groupes de pays avec devise, langue et ajustement de prix. */
export default async function MarketsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { ok, err } = await searchParams;
  const { store } = await requireOwner();
  const markets = await db.market.findMany({ where: { storeId: store.id }, orderBy: { position: "asc" } });
  const currencies = storeCurrencies(store).map((c) => c.code).filter((c) => c !== store.currency);
  const locales = storeLocales(store).slice(1);
  return (
    <>
      <PageHeader back="/admin/settings" title="Marchés" subtitle="Adaptez la boutique par pays : devise, langue et prix. Le visiteur est rattaché au marché de son pays (choisi dans l'en-tête, ou détecté), et le paiement utilise le marché du pays de livraison." />
      {ok && <p role="status" className="rounded-lg border border-[#b4fed2] bg-[#ecfdf3] px-4 py-3 text-[#0c5132]">{ok}</p>}
      {err && <p role="alert" className="rounded-lg border border-[#fedad9] bg-[#fff4f4] px-4 py-3 text-[#8e0b21]">{err}</p>}
      <section className="card p-4">
        <WorldMap markets={markets.map((m) => ({ id: m.id, name: m.name, countries: marketCountries(m), enabled: m.enabled }))} defaultLabel="Marché par défaut" />
      </section>
      <section className="card overflow-hidden">
        <div className="card-h"><h2 className="text-sm font-[650]">Marché par défaut de la boutique</h2><Pill tone="ok">Actif</Pill></div>
        <p className="px-4 py-3 text-[13px] text-muted">Tous les pays qui ne sont dans aucun marché : devise {store.currency}, langue principale, prix de la boutique.</p>
      </section>
      {markets.map((m, i) => (
        <details key={m.id} className="card" open={Boolean(err)}>
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3">
            <i className="inline-block h-3 w-3 rounded-sm" style={{ background: MARKET_COLORS[i % MARKET_COLORS.length] }} aria-hidden />
            <span className="flex-1 font-[650]">{m.name}</span>
            <span className="text-xs text-muted">{marketCountries(m).length} pays · {m.currency || store.currency} · {m.locale ? LOCALES[m.locale as keyof typeof LOCALES] : "langue principale"} · prix {m.priceAdjustBps === 0 ? "inchangés" : `${m.priceAdjustBps > 0 ? "+" : "−"}${Math.abs(m.priceAdjustBps / 100).toLocaleString("fr-FR")} %`}</span>
            {m.enabled ? <Pill tone="ok">Actif</Pill> : <Pill>Désactivé</Pill>}
            <form action={toggleMarket}><input type="hidden" name="id" value={m.id} /><button className="btn h-8">{m.enabled ? "Désactiver" : "Activer"}</button></form>
            <form action={deleteMarket}><input type="hidden" name="id" value={m.id} /><ConfirmSubmit label="Supprimer" confirmLabel="Supprimer ce marché" className="h-8" /></form>
          </summary>
          <div className="border-t border-line p-4"><MarketForm m={{ ...m, countries: marketCountries(m) }} currencies={currencies} locales={locales} /></div>
        </details>
      ))}
      <section className="card p-4">
        <h2 className="mb-3 text-sm font-[650]">Créer un marché</h2>
        {!currencies.length && !locales.length && <p className="mb-3 text-xs text-muted">Pour proposer une autre devise ou une autre langue sur un marché, ajoutez-les d'abord dans Paramètres → Devises et Paramètres → Langues.</p>}
        <MarketForm m={null} currencies={currencies} locales={locales} />
      </section>
    </>
  );
}
