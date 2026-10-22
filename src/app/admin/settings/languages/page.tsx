import Link from "next/link";
import { saveEntityTranslations, saveLanguages, saveStoreTranslations } from "./actions";
import { PageHeader, Pill } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { db, textSearch } from "@/lib/db";
import { readTranslations } from "@/lib/i18n";
import { storeLocales } from "@/lib/locale";
import { allMenus, storeMenus } from "@/lib/navigation";
import { readTheme, SECTION_LABELS, SECTION_TEXT_FIELDS } from "@/lib/theme";
import { cx } from "@/lib/utils";

export const metadata = { title: "Langues et traductions" };

const TABS = [["store", "Boutique"], ["products", "Produits"], ["collections", "Collections"], ["pages", "Pages"]] as const;
const FIELD_LABELS: Record<string, string> = { title: "Titre", subtitle: "Sous-titre", body: "Texte", buttonLabel: "Bouton", description: "Description", seoTitle: "Titre pour Google", seoDescription: "Description pour Google" };

/** Une ligne « français → anglais » : le texte d'origine à gauche, la traduction à droite. */
function Row({ name, label, fr, en, long }: { name: string; label: string; fr: string; en?: string; long?: boolean }) {
  if (!fr.trim()) return null;
  return (
    <div className="grid gap-2 border-b border-line py-3 last:border-0 md:grid-cols-2">
      <div className="min-w-0"><div className="text-xs font-[550] text-muted">{label} · français</div><div className={cx("whitespace-pre-line text-[13px]", long && "line-clamp-6")}>{fr}</div></div>
      <label className="label min-w-0"><span className="text-xs font-[550] text-muted">Anglais</span>
        {long ? <textarea name={`en.${name}`} defaultValue={en ?? ""} rows={4} className="input" /> : <input name={`en.${name}`} defaultValue={en ?? ""} className="input" />}
      </label>
    </div>
  );
}

export default async function LanguagesPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; saved?: string }> }) {
  const { tab = "store", q = "", saved } = await searchParams;
  const { store } = await requireOwner();
  const enabled = storeLocales(store).includes("en");
  const st = readTranslations(store.translations).en ?? {};
  const theme = readTheme(store.theme, store.name);
  const menus = await storeMenus(store);
  const menuTitles = [...new Set(allMenus(menus).flatMap((m) => m.items).flatMap((i) => [i.title, ...(i.children ?? []).map((c) => c.title)]))];
  const search = q ? { title: textSearch(q) } : {};
  const [products, collections, pages] = await Promise.all([
    tab === "products" ? db.product.findMany({ where: { storeId: store.id, ...search }, orderBy: { title: "asc" }, take: 50 }) : [],
    tab === "collections" ? db.collection.findMany({ where: { storeId: store.id, ...search }, orderBy: { title: "asc" } }) : [],
    tab === "pages" ? db.page.findMany({ where: { storeId: store.id, ...search }, orderBy: { title: "asc" } }) : [],
  ]);
  const done = (json: string) => Boolean(readTranslations(json).en?.title);
  const entityForm = (kind: "product" | "collection" | "page", row: { id: string; title: string; translations: string } & Record<string, unknown>, fields: string[]) => {
    const en = readTranslations(row.translations).en ?? {};
    return (
      <details key={row.id} id={row.id} open={saved === row.id} className="border-b border-line last:border-0">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 hover:bg-[#f7f7f7]">
          <span className="flex-1 font-[550]">{row.title}</span>
          {saved === row.id ? <Pill tone="ok">Enregistré</Pill> : done(row.translations) ? <Pill tone="ok" dot={false}>Traduit</Pill> : <Pill dot={false}>À traduire</Pill>}
        </summary>
        <form action={saveEntityTranslations} className="px-4 pb-4">
          <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={row.id} /><input type="hidden" name="q" value={q} />
          {fields.map((f) => <Row key={f} name={f} label={FIELD_LABELS[f]} fr={String(row[f] ?? "")} en={en[f]} long={f === "description" || f === "body" || f === "seoDescription"} />)}
          <div className="flex justify-end pt-2"><button className="btn btn-primary">Enregistrer</button></div>
        </form>
      </details>
    );
  };

  return (
    <>
      <PageHeader back="/admin/settings" title="Langues et traductions" subtitle="Proposez votre boutique en anglais. Les visiteurs choisissent la langue dans l'en-tête ; elle est détectée automatiquement à la première visite." />
      <form action={saveLanguages} className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <div className="flex-1"><div className="font-[650]">Français <span className="text-xs font-normal text-muted">· langue principale</span></div><div className="text-xs text-muted">Les textes que vous saisissez partout dans l'admin.</div></div>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="en" defaultChecked={enabled} className="h-4 w-4 accent-[#7c3aed]" />Proposer la boutique en anglais</label>
        <button className="btn">Enregistrer</button>
      </form>
      {!enabled && <p className="mb-4 text-[13px] text-muted">Vous pouvez préparer les traductions avant d'activer l'anglais. Un texte non traduit s'affiche en français ; les boutons, le panier et le paiement sont déjà traduits.</p>}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1.5">
          {TABS.map(([k, label]) => <Link key={k} href={`/admin/settings/languages?tab=${k}`} className={cx("rounded-lg px-3 py-1.5 text-[13px] font-[550]", tab === k ? "bg-[#e3e3e3] text-ink" : "text-muted hover:bg-[#f1f1f1] hover:text-ink")}>{label}</Link>)}
          {tab !== "store" && (
            <form className="ml-auto"><input type="hidden" name="tab" value={tab} /><input name="q" defaultValue={q} placeholder="Rechercher" aria-label="Rechercher" className="input h-7 w-48 py-1" /></form>
          )}
        </div>

        {tab === "store" && (
          <form action={saveStoreTranslations} className="px-4 pb-4">
            {saved && <p role="status" className="mt-3 rounded-lg bg-[#ecfdf3] px-3 py-2 text-[13px] text-[#0c5132]">Traductions enregistrées.</p>}
            <h2 className="mt-4 text-sm font-[650]">Textes généraux</h2>
            <Row name="tagline" label="Slogan" fr={store.tagline} en={st.tagline} />
            <Row name="announcement" label="Bandeau d'annonce" fr={theme.announcement} en={st.announcement} />
            <Row name="passwordMessage" label="Message de la page mot de passe" fr={store.passwordMessage} en={st.passwordMessage} />
            {theme.sections.length > 0 && <h2 className="mt-6 text-sm font-[650]">Page d'accueil</h2>}
            {theme.sections.map((sec) => SECTION_TEXT_FIELDS.map((f) => {
              const fr = (sec as Record<string, unknown>)[f];
              return typeof fr === "string" ? <Row key={`${sec.id}.${f}`} name={`s.${sec.id}.${f}`} label={`${SECTION_LABELS[sec.type]} · ${FIELD_LABELS[f]}`} fr={fr} en={st[`s.${sec.id}.${f}`]} long={f === "body" || f === "subtitle"} /> : null;
            }))}
            {menuTitles.length > 0 && <h2 className="mt-6 text-sm font-[650]">Menus</h2>}
            {menuTitles.map((m) => <Row key={m} name={`menu.${m}`} label="Lien de menu" fr={m} en={st[`menu.${m}`]} />)}
            <div className="flex justify-end pt-3"><button className="btn btn-primary">Enregistrer</button></div>
          </form>
        )}
        {tab === "products" && (products.length ? products.map((p) => entityForm("product", p, ["title", "description", "seoTitle", "seoDescription"])) : <p className="px-4 py-8 text-center text-muted">Aucun produit.</p>)}
        {tab === "products" && products.length === 50 && <p className="px-4 py-3 text-xs text-muted">Les 50 premiers produits sont affichés : utilisez la recherche pour trouver les autres.</p>}
        {tab === "collections" && (collections.length ? collections.map((c) => entityForm("collection", c, ["title", "description"])) : <p className="px-4 py-8 text-center text-muted">Aucune collection.</p>)}
        {tab === "pages" && (pages.length ? pages.map((p) => entityForm("page", p, ["title", "body"])) : <p className="px-4 py-8 text-center text-muted">Aucune page.</p>)}
      </div>
    </>
  );
}
