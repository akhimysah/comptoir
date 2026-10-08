"use client";

import Link from "next/link";
import { useActionState, useMemo, useRef, useState } from "react";
import { saveProduct, type ProductPayload } from "@/app/admin/products/actions";
import { Thumb } from "@/components/ui";
import { uploadImage } from "./upload";

type Option = { name: string; values: string[] };
type VariantRow = ProductPayload["variants"][number];

export type ProductFormInitial = Omit<ProductPayload, "id"> & { id?: string };

const key = (vals: string[]) => vals.join("\u0000");

function cartesian(options: Option[]): string[][] {
  const usable = options.filter((o) => o.name.trim() && o.values.length);
  if (!usable.length) return [[]];
  return usable.reduce<string[][]>((acc, o) => acc.flatMap((combo) => o.values.map((v) => [...combo, v])), [[]]);
}

export function ProductForm({ initial, collections, currency }: { initial: ProductFormInitial; collections: { id: string; title: string }[]; currency: string }) {
  const [state, action, pending] = useActionState(saveProduct, undefined);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [status, setStatus] = useState(initial.status);
  const [hue, setHue] = useState(initial.hue);
  const [images, setImages] = useState<string[]>(initial.images);
  const [options, setOptions] = useState<Option[]>(initial.options);
  const [rows, setRows] = useState<Record<string, VariantRow>>(() => Object.fromEntries(initial.variants.map((v) => [key(v.optionValues), v])));
  const [collectionIds, setCollectionIds] = useState<string[]>(initial.collectionIds);
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

  const payload: ProductPayload = { id: initial.id, title, description, status, hue, images, options: options.filter((o) => o.name.trim() && o.values.length), variants, collectionIds };
  const hasOptions = combos[0].length > 0;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="card flex flex-col gap-4 p-5">
            <label className="label">Titre<input id="title" className="input" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Tasse en grès émaillé" /></label>
            <label className="label">Description<textarea id="description" className="input min-h-[140px]" maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Matière, dimensions, entretien…" /></label>
          </section>

          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-[650]">Photos</h2>
              <span className="text-xs text-muted">{images.length}/10 · la première est l'image principale</span>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {images.map((src, i) => (
                <div key={src} className="group relative aspect-square overflow-hidden rounded-lg border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                    {i > 0 ? <button type="button" className="btn btn-sm px-2" onClick={() => setImages((im) => [im[i], ...im.filter((_, j) => j !== i)])} aria-label="Mettre en image principale">★</button> : <span />}
                    <button type="button" className="btn btn-sm px-2" onClick={() => setImages((im) => im.filter((_, j) => j !== i))} aria-label="Retirer la photo">✕</button>
                  </div>
                </div>
              ))}
              {images.length < 10 && (
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="grid aspect-square place-items-center rounded-lg border-2 border-dashed border-line text-sm text-muted hover:border-pine hover:text-pine">
                  {uploading ? "Envoi…" : "+ Ajouter"}
                </button>
              )}
            </div>
            <input ref={fileRef} id="product-images" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => onFiles(e.target.files)} />
            {uploadError && <p className="mt-2 text-sm text-red-700">{uploadError}</p>}
            {!images.length && (
              <div className="mt-4 flex items-center gap-4">
                <Thumb hue={hue} title={title || "?"} className="h-14 w-14 text-base" />
                <label className="label flex-1">Couleur du visuel sans photo<input id="hue" type="range" min={0} max={359} value={hue} onChange={(e) => setHue(Number(e.target.value))} className="accent-[#303030]" /></label>
              </div>
            )}
          </section>

          <section className="card p-5">
            <div className="mb-1 flex items-center justify-between gap-3">
              <h2 className="text-sm font-[650]">Options</h2>
              {options.length < 3 && (
                <button type="button" className="btn btn-sm" onClick={() => setOptions((o) => [...o, { name: o.length === 0 ? "Taille" : o.length === 1 ? "Couleur" : "Matière", values: [] }])}>+ Ajouter une option</button>
              )}
            </div>
            <p className="mb-4 text-sm text-muted">Tailles, couleurs… Chaque combinaison devient une variante avec son prix et son stock.</p>
            <div className="flex flex-col gap-4">
              {options.map((o, i) => (
                <OptionEditor
                  key={i}
                  option={o}
                  onChange={(next) => setOptions((all) => all.map((x, j) => (j === i ? next : x)))}
                  onRemove={() => setOptions((all) => all.filter((_, j) => j !== i))}
                />
              ))}
            </div>
          </section>

          <section className="card min-w-0">
            <div className="card-h">
              <h2 className="text-sm font-[650]">{hasOptions ? `Variantes (${variants.length})` : "Prix et stock"}</h2>
              {hasOptions && variants.length > 1 && (
                <div className="flex items-center gap-2">
                  <input id="bulk-price" className="input w-28 py-1.5" placeholder="Prix pour tout" value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)} inputMode="decimal" />
                  <button type="button" className="btn btn-sm" disabled={!bulkPrice} onClick={() => { setRows((r) => { const n = { ...r }; for (const v of variants) n[key(v.optionValues)] = { ...v, price: bulkPrice }; return n; }); setBulkPrice(""); }}>Appliquer</button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr>
                    {hasOptions && <th className="th">Variante</th>}
                    <th className="th">Prix ({currency})</th>
                    <th className="th">Prix barré</th>
                    <th className="th">Stock</th>
                    <th className="th">Référence</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) => (
                    <tr key={key(v.optionValues)}>
                      {hasOptions && <td className="td font-semibold">{v.optionValues.join(" / ")}</td>}
                      <td className="td"><input aria-label="Prix" className="input num" inputMode="decimal" required value={v.price} onChange={(e) => setRow(v.optionValues, { price: e.target.value })} placeholder="0,00" /></td>
                      <td className="td"><input aria-label="Prix barré" className="input num" inputMode="decimal" value={v.compareAt} onChange={(e) => setRow(v.optionValues, { compareAt: e.target.value })} placeholder="Optionnel" /></td>
                      <td className="td"><input aria-label="Stock" className="input num w-24" type="number" min={0} value={v.stock} onChange={(e) => setRow(v.optionValues, { stock: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></td>
                      <td className="td"><input aria-label="Référence" className="input" value={v.sku} maxLength={60} onChange={(e) => setRow(v.optionValues, { sku: e.target.value })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-5">
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="text-sm font-[650]">Statut</h2>
            <select id="status" className="input" value={status} onChange={(e) => setStatus(e.target.value as "draft" | "active")}>
              <option value="active">Actif</option>
              <option value="draft">Brouillon</option>
            </select>
          </section>
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="text-sm font-[650]">Collections</h2>
            {collections.length ? (
              collections.map((c) => (
                <label key={c.id} className="flex items-center gap-2.5 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-[#303030]" checked={collectionIds.includes(c.id)} onChange={(e) => setCollectionIds((ids) => (e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id)))} />
                  {c.title}
                </label>
              ))
            ) : (
              <p className="text-sm text-muted">Aucune collection. <Link href="/admin/collections/new" className="font-semibold text-pine">En créer une</Link></p>
            )}
          </section>
        </aside>
      </div>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-xl md:border">
        {state?.error && <p role="alert" className="mr-auto text-sm font-semibold text-red-700">{state.error}</p>}
        <Link href="/admin/products" className="btn">Annuler</Link>
        <button className="btn btn-primary" disabled={pending || uploading}>{pending ? "Enregistrement…" : initial.id ? "Enregistrer" : "Ajouter le produit"}</button>
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
    <div className="rounded-lg border border-line p-4">
      <div className="flex gap-2">
        <input aria-label="Nom de l'option" className="input font-semibold" value={option.name} maxLength={30} onChange={(e) => onChange({ ...option, name: e.target.value })} />
        <button type="button" className="btn btn-danger" onClick={onRemove}>Retirer</button>
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
