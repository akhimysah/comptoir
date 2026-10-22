"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useMemo, useRef, useState } from "react";
import { saveProduct, type ProductPayload } from "@/app/admin/products/actions";
import { Thumb } from "@/components/ui";
import { formatMoney, parseMoney } from "@/lib/money";
import { choicesOf, type MetafieldDef } from "@/lib/metafields";
import { SaveBar } from "./SaveBar";
import { SeoCard } from "./SeoCard";
import { TemplateSelect } from "./TemplateSelect";
import { uploadImage } from "./upload";

type Option = { name: string; values: string[] };
type VariantRow = ProductPayload["variants"][number];

export type ProductFormInitial = Omit<ProductPayload, "id" | "seoTitle" | "seoDescription" | "isGiftCard" | "continueSelling" | "bundle" | "subscriptionInterval" | "subscriptionDiscountPct" | "metafields" | "complementaryIds" | "category" | "productType" | "vendor" | "tags" | "taxable" | "templateSuffix" | "videoUrl"> & { videoUrl?: string; metafields?: Record<string, string>; complementaryIds?: string[]; id?: string; seoTitle?: string; seoDescription?: string; isGiftCard?: boolean; continueSelling?: boolean; bundle?: { variantId: string; quantity: number }[]; subscriptionInterval?: "" | "week" | "month"; subscriptionDiscountPct?: number; category?: string; productType?: string; vendor?: string; tags?: string[]; taxable?: boolean; templateSuffix?: string };
export type BundleChoice = { id: string; label: string; stock: number };

/** Catégories proposées dans la liste déroulante (saisie libre possible). */
const CATEGORY_SUGGESTIONS = ["Vêtements", "Accessoires", "Maison", "Beauté", "Alimentation", "Sport", "Autre"];
/** Rangée de variante vide (nouvelle combinaison d'options). */
const emptyVariant = (vals: string[], from?: VariantRow): VariantRow => ({ optionValues: vals, price: from?.price ?? "", compareAt: from?.compareAt ?? "", cost: from?.cost ?? "", weight: from?.weight ?? "", sku: "", barcode: "", lengthCm: from?.lengthCm ?? "", widthCm: from?.widthCm ?? "", heightCm: from?.heightCm ?? "", stock: 0 });
const key = (vals: string[]) => vals.join("\u0000");

function cartesian(options: Option[]): string[][] {
  const usable = options.filter((o) => o.name.trim() && o.values.length);
  if (!usable.length) return [[]];
  return usable.reduce<string[][]>((acc, o) => acc.flatMap((combo) => o.values.map((v) => [...combo, v])), [[]]);
}

export function ProductForm({ initial, collections, currency, storeUrl, handle, bundleChoices = [], fieldDefs = [], productChoices = [], templateOptions = [] }: { initial: ProductFormInitial; collections: { id: string; title: string }[]; currency: string; storeUrl: string; handle?: string; bundleChoices?: BundleChoice[]; fieldDefs?: MetafieldDef[]; productChoices?: { id: string; title: string }[]; templateOptions?: string[] }) {
  const [complementaryIds, setComplementaryIds] = useState<string[]>(initial.complementaryIds ?? []);
  const [compQ, setCompQ] = useState("");
  const [metafields, setMetafields] = useState<Record<string, string>>(initial.metafields ?? {});
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
  const [category, setCategory] = useState(initial.category ?? "");
  const [productType, setProductType] = useState(initial.productType ?? "");
  const [vendor, setVendor] = useState(initial.vendor ?? "");
  const [tags, setTags] = useState<string[]>(initial.tags ?? []);
  const [taxable, setTaxable] = useState(initial.taxable ?? true);
  const [templateSuffix, setTemplateSuffix] = useState(initial.templateSuffix ?? "");
  const [videoUrl, setVideoUrl] = useState(initial.videoUrl ?? "");
  const [bundleQ, setBundleQ] = useState("");
  const isBundle = bundle.length > 0;
  const [seo, setSeo] = useState({ seoTitle: initial.seoTitle ?? "", seoDescription: initial.seoDescription ?? "" });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [bulkPrice, setBulkPrice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const combos = useMemo(() => cartesian(options), [options]);
  const firstRow = Object.values(rows)[0];
  const variants: VariantRow[] = combos.map((vals) => rows[key(vals)] ?? emptyVariant(vals, firstRow));
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

  const payload: ProductPayload = { id: initial.id, title, description, status, hue, images, options: options.filter((o) => o.name.trim() && o.values.length), variants, collectionIds, ...seo, isGiftCard, continueSelling, bundle, subscriptionInterval: subInterval, subscriptionDiscountPct: subPct, metafields, complementaryIds, category, productType, vendor, tags, taxable, templateSuffix, videoUrl };
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
                      <label className="label mt-4">Vidéo <span className="hint">Adresse YouTube ou Vimeo, affichée dans la galerie après les photos (comme les médias Shopify).</span><input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" className="input" /></label>
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
                <div className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-3 sm:items-end">
                  <label className="label">Coût par article <span className="hint">Les clients ne le voient pas.</span>
                    <span className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">{currency === "EUR" ? "€" : currency}</span>
                    <input id="cost" className="input num pl-9" inputMode="decimal" value={single.cost} onChange={(e) => setRow([], { cost: e.target.value })} placeholder="0,00" /></span>
                  </label>
                  <Margin price={single.price} cost={single.cost} currency={currency} />
                </div>
              </section>
              <section className="card p-4">
                <h2 className="mb-3 text-sm font-[650]">Stock</h2>
                {isBundle ? <p className="text-[13px] text-muted">Le stock d'un lot se calcule à partir de celui de ses composants : rien à saisir ici.</p> : <div className="grid gap-3 sm:grid-cols-2">
                  <label className="label">SKU (référence)<input id="sku" className="input" maxLength={60} value={single.sku} onChange={(e) => setRow([], { sku: e.target.value })} /></label>
                  <label className="label">Quantité<input id="stock" className="input num" type="number" min={0} value={single.stock} onChange={(e) => setRow([], { stock: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></label>
                  <label className="label">Code-barres (ISBN, UPC, GTIN, etc.)<input id="barcode" className="input" maxLength={40} value={single.barcode} onChange={(e) => setRow([], { barcode: e.target.value })} placeholder="3760123456789" /></label>
                  <label className="label">Poids (kg) <span className="hint">Pour les tarifs d'expédition au poids.</span><input id="weight" className="input num" inputMode="decimal" value={single.weight} onChange={(e) => setRow([], { weight: e.target.value })} placeholder="0,45" /></label>
                  <div className="label">Taille du produit emballé (cm) <span className="hint">Longueur × largeur × hauteur, pour les étiquettes et transporteurs.</span>
                    <DimensionsInput row={single} onChange={(patch) => setRow([], patch)} />
                  </div>
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
                  <table className="w-full min-w-[760px]">
                    <thead><tr><th className="th">Variante</th>{images.length > 0 && <th className="th">Photo</th>}<th className="th">Prix</th><th className="th">Prix avant réduction</th><th className="th">Coût</th><th className="th">Poids (kg)</th><th className="th">Disponible</th><th className="th">SKU</th><th className="th">Code-barres</th><th className="th">L × l × H (cm)</th></tr></thead>
                    <tbody>
                      {variants.map((v) => (
                        <tr key={key(v.optionValues)}>
                          <td className="td font-[550]">{v.optionValues.join(" / ")}</td>
                          {images.length > 0 && (
                            <td className="td">
                              <div className="flex items-center gap-1.5">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {v.image && images.includes(v.image) ? <img src={v.image} alt="" className="h-8 w-8 rounded-md object-cover" /> : <span className="grid h-8 w-8 place-items-center rounded-md border border-dashed border-line text-[10px] text-muted">—</span>}
                                <select aria-label={`Photo de ${v.optionValues.join(" / ")}`} value={v.image && images.includes(v.image) ? v.image : ""} onChange={(e) => setRow(v.optionValues, { image: e.target.value || null })} className="input h-8 w-24 py-0 text-xs">
                                  <option value="">Aucune</option>
                                  {images.map((src, i) => <option key={src} value={src}>Photo {i + 1}</option>)}
                                </select>
                              </div>
                            </td>
                          )}
                          <td className="td"><input aria-label={`Prix ${v.optionValues.join(" / ")}`} className="input num w-28" inputMode="decimal" required value={v.price} onChange={(e) => setRow(v.optionValues, { price: e.target.value })} placeholder="0,00" /></td>
                          <td className="td"><input aria-label={`Prix avant réduction ${v.optionValues.join(" / ")}`} className="input num w-28" inputMode="decimal" value={v.compareAt} onChange={(e) => setRow(v.optionValues, { compareAt: e.target.value })} placeholder="0,00" /></td>
                          <td className="td"><input aria-label={`Coût par article ${v.optionValues.join(" / ")}`} className="input num w-24" inputMode="decimal" value={v.cost} onChange={(e) => setRow(v.optionValues, { cost: e.target.value })} placeholder="0,00" /></td>
                          <td className="td"><input aria-label={`Poids ${v.optionValues.join(" / ")}`} className="input num w-20" inputMode="decimal" value={v.weight} onChange={(e) => setRow(v.optionValues, { weight: e.target.value })} placeholder="0,45" /></td>
                          <td className="td"><input aria-label={`Disponible ${v.optionValues.join(" / ")}`} className="input num w-20" type="number" min={0} value={v.stock} onChange={(e) => setRow(v.optionValues, { stock: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></td>
                          <td className="td"><input aria-label={`SKU ${v.optionValues.join(" / ")}`} className="input w-28" value={v.sku} maxLength={60} onChange={(e) => setRow(v.optionValues, { sku: e.target.value })} /></td>
                          <td className="td"><input aria-label={`Code-barres ${v.optionValues.join(" / ")}`} className="input w-32" value={v.barcode} maxLength={40} onChange={(e) => setRow(v.optionValues, { barcode: e.target.value })} /></td>
                          <td className="td"><DimensionsInput row={v} compact onChange={(patch) => setRow(v.optionValues, patch)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-line px-4 py-2.5 text-center text-xs text-muted">Stock total : {totalStock} disponible{totalStock > 1 ? "s" : ""}</div>
              </>
            )}
          </section>
          {productChoices.length > 0 && !isGiftCard && (
            <section className="card flex flex-col gap-3 p-4">
              <div>
                <h2 className="text-sm font-[650]">Produits complémentaires</h2>
                <p className="text-xs text-muted">Proposés dans « Souvent achetés ensemble » sur la fiche et dans le panier. Sans choix, la boutique propose les produits souvent achetés avec celui-ci.</p>
              </div>
              {complementaryIds.length > 0 && (
                <ol className="flex flex-col gap-1">
                  {complementaryIds.map((id, i) => (
                    <li key={id} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5 text-[13px]">
                      <span className="w-4 text-muted">{i + 1}</span>
                      <span className="flex-1 truncate">{productChoices.find((p) => p.id === id)?.title ?? "Produit supprimé"}</span>
                      <button type="button" disabled={i === 0} onClick={() => setComplementaryIds((c) => { const n = [...c]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })} className="px-1 text-muted disabled:opacity-30" aria-label="Monter">↑</button>
                      <button type="button" onClick={() => setComplementaryIds((c) => c.filter((x) => x !== id))} className="px-1 text-muted hover:text-[#8e0b21]" aria-label="Retirer">✕</button>
                    </li>
                  ))}
                </ol>
              )}
              {complementaryIds.length < 6 && (
                <div className="relative">
                  <input value={compQ} onChange={(e) => setCompQ(e.target.value)} placeholder="Ajouter un produit complémentaire" aria-label="Ajouter un produit complémentaire" className="input" />
                  {compQ.trim() && (
                    <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl bg-white p-1 shadow-[0_4px_16px_rgba(0,0,0,.15),0_0_0_1px_rgba(0,0,0,.06)]">
                      {productChoices.filter((p) => p.id !== initial.id && !complementaryIds.includes(p.id) && p.title.toLowerCase().includes(compQ.toLowerCase())).slice(0, 8).map((p) => (
                        <li key={p.id}><button type="button" onClick={() => { setComplementaryIds((c) => [...c, p.id]); setCompQ(""); }} className="w-full rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-[#f1f1f1]">{p.title}</button></li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )}
          {fieldDefs.length > 0 && (
            <section className="card flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between"><h2 className="text-sm font-[650]">Champs personnalisés</h2><Link href="/admin/settings/custom-data" className="text-xs text-pine hover:underline">Gérer les champs</Link></div>
              <div className="grid gap-3 sm:grid-cols-2">
                {fieldDefs.map((d) => {
                  const v = metafields[d.key] ?? "";
                  const set = (x: string) => setMetafields((m) => { const n = { ...m }; if (x === "") delete n[d.key]; else n[d.key] = x; return n; });
                  return (
                    <label key={d.key} className={`label ${d.type === "multiline" ? "sm:col-span-2" : ""}`}>{d.name}{d.unit ? ` (${d.unit})` : ""}
                      {d.type === "multiline" ? <textarea value={v} onChange={(e) => set(e.target.value)} rows={3} maxLength={2000} className="input" />
                        : d.type === "boolean" ? <select value={v} onChange={(e) => set(e.target.value)} className="input"><option value="">—</option><option value="true">Oui</option><option value="false">Non</option></select>
                        : d.type === "choice" ? <select value={v} onChange={(e) => set(e.target.value)} className="input"><option value="">—</option>{choicesOf(d).map((c) => <option key={c} value={c}>{c}</option>)}</select>
                        : <input value={v} onChange={(e) => set(e.target.value)} inputMode={d.type === "number" ? "decimal" : undefined} maxLength={200} className="input" />}
                    </label>
                  );
                })}
              </div>
            </section>
          )}
          <TemplateSelect kind="product" options={templateOptions} value={templateSuffix} onChange={setTemplateSuffix} />
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
          <section className="card flex flex-col gap-3 p-4">
            <h2 className="text-sm font-[650]">Organisation du produit</h2>
            <label className="label">Catégorie
              <input id="category" className="input" list="product-categories" maxLength={100} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Vêtements, Maison…" />
              <datalist id="product-categories">{CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label className="label">Type de produit<input id="product-type" className="input" maxLength={100} value={productType} onChange={(e) => setProductType(e.target.value)} placeholder="T-shirt, Bougie…" /></label>
            <label className="label">Fournisseur<input id="vendor" className="input" maxLength={100} value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Marque ou fabricant" /></label>
            <TagsInput tags={tags} onChange={setTags} />
            <label className="flex items-start gap-2 border-t border-line pt-3 text-[13px]">
              <input type="checkbox" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#7c3aed]" />
              <span>Facturer la taxe sur ce produit<span className="block text-xs text-muted">Décochez pour un produit exonéré : aucune TVA n'est ajoutée sur ses lignes.</span></span>
            </label>
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

/** Balises séparées par des virgules, affichées en pastilles (Entrée ou virgule pour ajouter). */
function TagsInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const vals = draft.split(",").map((v) => v.trim().slice(0, 50)).filter(Boolean).filter((v) => !tags.includes(v));
    if (vals.length) onChange([...tags, ...vals].slice(0, 50));
    setDraft("");
  };
  return (
    <div className="label">Balises <span className="hint">Pour retrouver et filtrer vos produits (ex. été, promo, nouveauté).</span>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-[#ebebeb] py-0.5 pl-2.5 pr-1 text-xs">
            {t}
            <button type="button" aria-label={`Retirer la balise ${t}`} className="grid h-4 w-4 place-items-center rounded-full hover:bg-white" onClick={() => onChange(tags.filter((x) => x !== t))}>✕</button>
          </span>
        ))}
      </div>
      <input
        id="tags"
        aria-label="Ajouter des balises"
        className="input"
        placeholder="été, promo puis Entrée"
        value={draft}
        maxLength={200}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
        onBlur={add}
      />
    </div>
  );
}

/** Taille du produit emballé : longueur × largeur × hauteur en cm (gardée en mm côté serveur). */
function DimensionsInput({ row, onChange, compact = false }: { row: VariantRow; onChange: (patch: Partial<VariantRow>) => void; compact?: boolean }) {
  const name = row.optionValues.join(" / ") || "produit";
  const w = compact ? "w-14" : "w-full";
  return (
    <div className="flex items-center gap-1">
      <input aria-label={`Longueur (cm) ${name}`} className={`input num ${w}`} inputMode="decimal" value={row.lengthCm} onChange={(e) => onChange({ lengthCm: e.target.value })} placeholder="L" />
      <span className="text-muted">×</span>
      <input aria-label={`Largeur (cm) ${name}`} className={`input num ${w}`} inputMode="decimal" value={row.widthCm} onChange={(e) => onChange({ widthCm: e.target.value })} placeholder="l" />
      <span className="text-muted">×</span>
      <input aria-label={`Hauteur (cm) ${name}`} className={`input num ${w}`} inputMode="decimal" value={row.heightCm} onChange={(e) => onChange({ heightCm: e.target.value })} placeholder="H" />
    </div>
  );
}

/** Profit et marge calculés en direct à partir du prix et du coût, comme dans Shopify. */
function Margin({ price, cost, currency }: { price: string; cost: string; currency: string }) {
  const p = parseMoney(price);
  const c = cost.trim() ? parseMoney(cost) : null;
  const ok = p !== null && c !== null && p > 0;
  return (
    <>
      <div className="label">Profit<div className="input num flex items-center bg-[#f7f7f7] text-muted">{ok ? formatMoney(p - c, currency) : "—"}</div></div>
      <div className="label">Marge<div className="input num flex items-center bg-[#f7f7f7] text-muted">{ok ? `${(((p - c) / p) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "—"}</div></div>
    </>
  );
}
