"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useMemo, useRef, useState } from "react";
import { saveProduct, type ProductPayload } from "@/app/admin/products/actions";
import { Thumb } from "@/components/ui";
import { SaveBar } from "./SaveBar";
import { SeoCard } from "./SeoCard";
import { uploadImage } from "./upload";

type Option = { name: string; values: string[] };
type VariantRow = ProductPayload["variants"][number];

export type ProductFormInitial = Omit<ProductPayload, "id" | "seoTitle" | "seoDescription" | "isGiftCard" | "continueSelling" | "bundle" | "subscriptionInterval" | "subscriptionDiscountPct"> & { id?: string; seoTitle?: string; seoDescription?: string; isGiftCard?: boolean; continueSelling?: boolean; bundle?: { variantId: string; quantity: number }[]; subscriptionInterval?: "" | "week" | "month"; subscriptionDiscountPct?: number };
export type BundleChoice = { id: string; label: string; stock: number };

const key = (vals: string[]) => vals.join("\u0000");

function cartesian(options: Option[]): string[][] {
  const usable = options.filter((o) => o.name.trim() && o.values.length);
  if (!usable.length) return [[]];
  return usable.reduce<string[][]>((acc, o) => acc.flatMap((combo) => o.values.map((v) => [...combo, v])), [[]]);
}

export function ProductForm({ initial, collections, currency, storeUrl, handle, bundleChoices = [] }: { initial: ProductFormInitial; collections: { id: string; title: string }[]; currency: string; storeUrl: string; handle?: string; bundleChoices?: BundleChoice[] }) {
  const [state, action, pending] = useActionState(saveProduct, undefined);
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [status, setStatus] = useState(initial.status);
  const [hue, setHue] = useState(initial.hue);
  const [images, setImages] = useState<string[]>(initial.images);
  const [options, setOptions] = useState<Option[]>(initial.options);
  const [rows, setRows] = useState<Record<string, VariantRow>>(() => Object.fromEntries(initial.variants.map((v) => [key(v.optionValues), v])));
  const [collectionIds, setCollectionIds] = useState<string[]>(initial.collectionIds);
  const [isGiftCard, setIsGiftCard] = useState(initial.isGiftCard ?? false);
  const [continueSelling, setContinueSelling] = useState(initial.continueSelling ?? false);
  const [bundle, setBundle] = useState(initial.bundle ?? []);
  const [subInterval, setSubInterval] = useState<"" | "week" | "month">(initial.subscriptionInterval ?? "");
  const [subPct, setSubPct] = useState(initial.subscriptionDiscountPct ?? 0);
  const [bundleQ, setBundleQ] = useState("");
  const isBundle = bundle.length > 0;
  const [seo, setSeo] = useState({ seoTitle: initial.seoTitle ?? "", seoDescription: initial.seoDescription ?? "" });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [bulkPrice, setBulkPrice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const combos = useMemo(() => cartesian(options), [options]);
  const firstRow = Object.values(rows)[0];
  const variants: VariantRow[] = combos.map(
    (vals) => rows[key(vals)] ?? { optionValues: vals, price: firstRow?.price ?? "", compareAt: firstRow?.compareAt ?? "", sku: "", stock: 0 },
  );
  // Une seule variante sans option garde son id même quand on retire les options.
  if (combos.length === 1 && combos[0].length === 0 && !rows[key([])] && firstRow) variants[0] = { ...firstRow, optionValues: [] };

  const setRow = (vals: string[], patch: Partial<VariantRow>) => {
    const k = key(vals);
    const current = variants.find((v) => key(v.optionValues) === k)!;
    setRows((r) => ({ ...r, [k]: { ...current, ...patch, optionValues: vals } }));
  };

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const f of Array.from(files).slice(0, 10 - images.length)) {
        const url = await uploadImage(f);
        setImages((imgs) => [...imgs, url]);
      }
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const payload: ProductPayload = { id: initial.id, title, description, status, hue, images, options: options.filter((o) => o.name.trim() && o.values.length), variants, collectionIds, ...seo, isGiftCard, continueSelling, bundle, subscriptionInterval: subInterval, subscriptionDiscountPct: subPct };
  const hasOptions = combos[0].length > 0;
  const [initialJson] = useState(() => JSON.stringify(payload));
  const dirty = !initial.id || JSON.stringify(payload) !== initialJson;
  const single = variants[0];
  const totalStock = variants.reduce((s, v) => s + v.stock, 0);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <SaveBar
        visible={dirty}
        message={initial.id ? "Produit non enregistré" : "Nouveau produit non enregistré"}
        pending={pending || uploading}
        error={state?.error}
        onDiscard={() => (initial.id ? window.location.reload() : router.push("/admin/products"))}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="card flex flex-col gap-3 p-4">
            <label className="label">Titre<input id="title" className="input" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="T-shirt à manches courtes" /></label>
            <label className="label">Description<textarea id="description" className="input min-h-[160px]" maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-[650]">Médias</h2>
            {images.length ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {images.map((src, i) => (
                  <div key={src} className={`group relative overflow-hidden rounded-lg border border-line ${i === 0 ? "col-span-2 row-span-2" : "aspect-square"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-full w-full object-cover" />
                    <div className="absolute inset-x-1 top-1 flex justify-between gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                      {i > 0 ? <button type="button" className="btn btn-sm px-2" onClick={() => setImages((im) => [im[i], ...im.filter((_, j) => j !== i)])} aria-label="Mettre en image principale">★</button> : <span />}
                      <button type="button" className="btn btn-sm px-2" onClick={() => setImages((im) => im.filter((_, j) => j !== i))} aria-label="Retirer la photo">✕</button>
                    </div>
                  </div>
                ))}
                {images.length < 10 && (
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="grid aspect-square place-items-center rounded-lg border border-dashed border-[#8a8a8a] text-2xl text-muted hover:bg-[#f7f7f7]" aria-label="Ajouter des photos">
                    {uploading ? <span className="text-xs">Envoi…</span> : "+"}
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-[#8a8a8a] px-4 py-8 text-center">
                <div className="flex gap-2">
                  <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? "Envoi…" : "Importer"}</button>
                </div>
                <span className="text-xs text-muted">Accepte les images JPG, PNG, WebP et GIF (5 Mo max).</span>
              </div>
            )}
            <input ref={fileRef} id="product-images" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => onFiles(e.target.files)} />
            {uploadError && <p className="mt-2 text-[13px] text-[#8e0b21]">{uploadError}</p>}
            {!images.length && (
              <div className="mt-3 flex items-center gap-3">
                <Thumb hue={hue} title={title || "?"} className="h-10 w-10 text-xs" />
                <label className="label flex-1 text-xs text-muted">Couleur du visuel tant qu'il n'y a pas de photo<input id="hue" type="range" min={0} max={359} value={hue} onChange={(e) => setHue(Number(e.target.value))} className="accent-[#7c3aed]" /></label>
              </div>
            )}
          </section>

          {!hasOptions && single && (
            <>
              <section className="card p-4">
                <h2 className="mb-3 text-sm font-[650]">Prix</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="label">Prix
                    <span className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">{currency === "EUR" ? "€" : currency}</span>
                    <input id="price" className="input num pl-9" inputMode="decimal" required value={single.price} onChange={(e) => setRow([], { price: e.target.value })} placeholder="0,00" /></span>
                  </label>
                  <label className="label">Prix avant réduction
                    <span className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">{currency === "EUR" ? "€" : currency}</span>
                    <input id="compare-at" className="input num pl-9" inputMode="decimal" value={single.compareAt} onChange={(e) => setRow([], { compareAt: e.target.value })} placeholder="0,00" /></span>
                  </label>
                </div>
              </section>
              <section className="card p-4">
                <h2 className="mb-3 text-sm font-[650]">Stock</h2>
                {isBundle ? <p className="text-[13px] text-muted">Le stock d'un lot se calcule à partir de celui de ses composants : rien à saisir ici.</p> : <div className="grid gap-3 sm:grid-cols-2">
                  <label className="label">SKU (référence)<input id="sku" className="input" maxLength={60} value={single.sku} onChange={(e) => setRow([], { sku: e.target.value })} /></label>
                  <label className="label">Quantité<input id="stock" className="input num" type="number" min={0} value={single.stock} onChange={(e) => setRow([], { stock: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></label>
                </div>}
              </section>
            </>
          )}

          {!isGiftCard && !hasOptions && (
            <section className="card flex flex-col gap-3 p-4">
              <div>
                <h2 className="text-sm font-[650]">Lot (pack)</h2>
                <p className="text-xs text-muted">Composez un pack à partir de vos produits. À chaque vente, le stock des composants baisse ; le lot est épuisé dès qu'un composant manque.</p>
              </div>
              {bundle.length > 0 && (
                <ul className="rounded-lg border border-line">
                  {bundle.map((b) => {
                    const c = bundleChoices.find((x) => x.id === b.variantId);
                    return (
                      <li key={b.variantId} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0">
                        <span className="min-w-0 flex-1 truncate">{c?.label ?? "Produit supprimé"}<span className="ml-2 text-xs text-muted">{c ? `${c.stock} en stock` : ""}</span></span>
                        <input aria-label="Quantité dans le lot" type="number" min={1} max={99} value={b.quantity} onChange={(e) => setBundle((bs) => bs.map((x) => (x.variantId === b.variantId ? { ...x, quantity: Math.max(1, Math.min(99, Math.floor(Number(e.target.value) || 1))) } : x)))} className="input num w-16" />
                        <button type="button" aria-label="Retirer du lot" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-[#f1f1f1]" onClick={() => setBundle((bs) => bs.filter((x) => x.variantId !== b.variantId))}>✕</button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="relative">
                <input aria-label="Ajouter un produit au lot" className="input" placeholder={bundle.length ? "Ajouter un autre produit au lot" : "Rechercher un produit à mettre dans le lot"} value={bundleQ} onChange={(e) => setBundleQ(e.target.value)} />
                {bundleQ.trim() && (
                  <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-xl bg-white p-1 shadow-[0_4px_16px_rgba(0,0,0,.15),0_0_0_1px_rgba(0,0,0,.06)]">
                    {bundleChoices.filter((c) => c.label.toLowerCase().includes(bundleQ.toLowerCase()) && !bundle.some((b) => b.variantId === c.id)).slice(0, 8).map((c) => (
                      <li key={c.id}><button type="button" className="flex w-full justify-between rounded-lg px-2 py-1.5 text-left hover:bg-[#f1f1f1]" onClick={() => { setBundle((bs) => [...bs, { variantId: c.id, quantity: 1 }]); setBundleQ(""); }}><span>{c.label}</span><span className="text-xs text-muted">{c.stock} en stock</span></button></li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          <section className="card min-w-0 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
              <h2 className="text-sm font-[650]">Variantes</h2>
            </div>
            <div className="flex flex-col gap-2 px-4 pb-4">
              {options.map((o, i) => (
                <OptionEditor
                  key={i}
                  option={o}
                  onChange={(next) => setOptions((all) => all.map((x, j) => (j === i ? next : x)))}
                  onRemove={() => setOptions((all) => all.filter((_, j) => j !== i))}
                />
              ))}
              {options.length < 3 && (
                <button type="button" className="flex items-center gap-1.5 self-start rounded-lg px-1 py-1 text-[13px] font-[550] text-pine hover:underline" onClick={() => setOptions((o) => [...o, { name: o.length === 0 ? "Taille" : o.length === 1 ? "Couleur" : "Matière", values: [] }])}>
                  <span className="grid h-4 w-4 place-items-center rounded-full border border-current text-[11px] leading-none">+</span>
                  {options.length ? "Ajouter une autre option" : "Ajouter des options comme la taille ou la couleur"}
                </button>
              )}
            </div>
            {hasOptions && (
              <>
                {variants.length > 1 && (
                  <div className="flex items-center gap-2 border-t border-line bg-[#f7f7f7] px-4 py-2">
                    <span className="text-xs text-muted">Modifier tous les prix</span>
                    <input id="bulk-price" className="input h-7 w-28 py-1" placeholder="0,00" value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)} inputMode="decimal" />
                    <button type="button" className="btn btn-sm" disabled={!bulkPrice} onClick={() => { setRows((r) => { const n = { ...r }; for (const v of variants) n[key(v.optionValues)] = { ...v, price: bulkPrice }; return n; }); setBulkPrice(""); }}>Appliquer</button>
                  </div>
                )}
                <div className="overflow-x-auto border-t border-line">
                  <table className="w-full min-w-[560px]">
                    <thead><tr><th className="th">Variante</th><th className="th">Prix</th><th className="th">Prix avant réduction</th><th className="th">Disponible</th><th className="th">SKU</th></tr></thead>
                    <tbody>
                      {variants.map((v) => (
                        <tr key={key(v.optionValues)}>
                          <td className="td font-[550]">{v.optionValues.join(" / ")}</td>
                          <td className="td"><input aria-label={`Prix ${v.optionValues.join(" / ")}`} className="input num w-28" inputMode="decimal" required value={v.price} onChange={(e) => setRow(v.optionValues, { price: e.target.value })} placeholder="0,00" /></td>
                          <td className="td"><input aria-label={`Prix avant réduction ${v.optionValues.join(" / ")}`} className="input num w-28" inputMode="decimal" value={v.compareAt} onChange={(e) => setRow(v.optionValues, { compareAt: e.target.value })} placeholder="0,00" /></td>
                          <td className="td"><input aria-label={`Disponible ${v.optionValues.join(" / ")}`} className="input num w-20" type="number" min={0} value={v.stock} onChange={(e) => setRow(v.optionValues, { stock: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></td>
                          <td className="td"><input aria-label={`SKU ${v.optionValues.join(" / ")}`} className="input w-28" value={v.sku} maxLength={60} onChange={(e) => setRow(v.optionValues, { sku: e.target.value })} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-line px-4 py-2.5 text-center text-xs text-muted">Stock total : {totalStock} disponible{totalStock > 1 ? "s" : ""}</div>
              </>
            )}
          </section>
          <SeoCard
            title={seo.seoTitle}
            description={seo.seoDescription}
            fallbackTitle={title}
            fallbackDescription={description}
            url={`${storeUrl}/p/${handle ?? "…"}`}
            onChange={(v) => setSeo((x) => ({ ...x, ...v }))}
          />
        </div>

        <aside className="flex flex-col gap-4">
          <section className="card flex flex-col gap-2 p-4">
            <h2 className="text-sm font-[650]">Statut</h2>
            <select id="status" className="input" value={status} onChange={(e) => setStatus(e.target.value as "draft" | "active")}>
              <option value="active">Actif</option>
              <option value="draft">Brouillon</option>
            </select>
            <p className="text-xs text-muted">{status === "active" ? "Visible dans la boutique en ligne." : "Masqué tant qu'il est en brouillon."}</p>
          </section>
          {!isGiftCard && (
            <section className="card flex flex-col gap-2 p-4">
              <h2 className="text-sm font-[650]">Abonnement</h2>
              <select aria-label="Fréquence d'abonnement" className="input" value={subInterval} onChange={(e) => setSubInterval(e.target.value as "" | "week" | "month")}>
                <option value="">Pas d'abonnement</option>
                <option value="week">Livré toutes les semaines</option>
                <option value="month">Livré tous les mois</option>
              </select>
              {subInterval && (
                <label className="flex items-center gap-2 text-[13px]">Remise abonné
                  <input type="number" min={0} max={90} value={subPct} onChange={(e) => setSubPct(Math.max(0, Math.min(90, Number(e.target.value) || 0)))} aria-label="Remise abonné en pourcentage" className="input num h-8 w-20" /> %
                </label>
              )}
              <p className="text-xs text-muted">Le client choisit entre achat unique et abonnement ; une commande est créée à chaque échéance.</p>
            </section>
          )}
          <section className="card flex flex-col gap-2 p-4">
            <h2 className="text-sm font-[650]">Organisation du produit</h2>
            <label className="flex items-start gap-2 text-[13px]">
              <input type="checkbox" checked={continueSelling} onChange={(e) => setContinueSelling(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#7c3aed]" />
              <span>Continuer à vendre en cas de rupture<span className="block text-xs text-muted">Précommande : le client peut acheter même sans stock, le bouton devient « Précommander ».</span></span>
            </label>
            <label className="flex items-start gap-2 text-[13px]">
              <input type="checkbox" checked={isGiftCard} onChange={(e) => setIsGiftCard(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#7c3aed]" />
              <span>Ce produit est une carte cadeau<span className="block text-xs text-muted">Chaque variante est un montant (ex. 25 €, 50 €). À l'achat, la carte est créée et envoyée par e-mail : pas de stock ni de livraison.</span></span>
            </label>
            <span className="text-[13px]">Collections</span>
            {collections.length ? (
              <div className="flex flex-col gap-1.5">
                {collections.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" className="h-4 w-4 accent-[#7c3aed]" checked={collectionIds.includes(c.id)} onChange={(e) => setCollectionIds((ids) => (e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id)))} />
                    {c.title}
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted">Aucune collection. <Link href="/admin/collections/new" className="text-pine hover:underline">En créer une</Link></p>
            )}
          </section>
        </aside>
      </div>
      <div className="flex justify-end border-t border-[#d4d4d4] pt-4">
        <button className="btn btn-primary" disabled={pending || uploading || !dirty}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </form>
  );
}

function OptionEditor({ option, onChange, onRemove }: { option: Option; onChange: (o: Option) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const vals = draft.split(",").map((v) => v.trim()).filter(Boolean).filter((v) => !option.values.includes(v));
    if (vals.length) onChange({ ...option, values: [...option.values, ...vals] });
    setDraft("");
  };
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex gap-2">
        <input aria-label="Nom de l'option" className="input font-semibold" value={option.name} maxLength={30} onChange={(e) => onChange({ ...option, name: e.target.value })} />
        <button type="button" className="btn btn-danger" onClick={onRemove}>Supprimer</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {option.values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1.5 rounded-full bg-[#ebebeb] py-1 pl-3 pr-1.5 text-sm">
            {v}
            <button type="button" aria-label={`Retirer ${v}`} className="grid h-5 w-5 place-items-center rounded-full hover:bg-white" onClick={() => onChange({ ...option, values: option.values.filter((x) => x !== v) })}>✕</button>
          </span>
        ))}
        <input
          aria-label="Ajouter des valeurs"
          className="input w-auto min-w-[180px] flex-1 py-1.5"
          placeholder="S, M, L puis Entrée"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
          onBlur={add}
        />
      </div>
    </div>
  );
}
