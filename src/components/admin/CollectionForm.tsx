"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveCollection, type CollectionPayload } from "@/app/admin/collections/actions";
import { Thumb } from "@/components/ui";
import { ImageField } from "./ImageField";

type P = { id: string; title: string; image: string | null; hue: number; status: string };

export function CollectionForm({ initial, products }: { initial: CollectionPayload; products: P[] }) {
  const [state, action, pending] = useActionState(saveCollection, undefined);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [image, setImage] = useState(initial.image);
  const [ids, setIds] = useState(initial.productIds);
  const [q, setQ] = useState("");
  const shown = products.filter((p) => p.title.toLowerCase().includes(q.toLowerCase()));
  const payload: CollectionPayload = { id: initial.id, title, description, image, productIds: ids };

  return (
    <form action={action} className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <section className="card flex flex-col gap-4 self-start p-5">
        <label className="label">Titre<input id="c-title" className="input" required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Nouveautés" /></label>
        <label className="label">Description<textarea id="c-desc" className="input min-h-[100px]" maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <ImageField id="c-image" label="Image de la collection" value={image} onChange={setImage} />
        {state?.error && <p role="alert" className="text-sm font-semibold text-red-700">{state.error}</p>}
        <div className="flex justify-end gap-2">
          <Link href="/admin/collections" className="btn">Annuler</Link>
          <button className="btn btn-primary" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </section>
      <section className="card min-w-0">
        <div className="card-h"><h2 className="text-sm font-[650]">Produits ({ids.length})</h2><input id="c-search" className="input max-w-[200px] py-1.5" placeholder="Rechercher" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <ul className="max-h-[480px] overflow-y-auto">
          {shown.map((p) => (
            <li key={p.id} className="border-b border-line last:border-0">
              <label className="flex cursor-pointer items-center gap-3 px-5 py-2.5 hover:bg-[#f7f7f7]">
                <input type="checkbox" className="h-4 w-4 accent-[#303030]" checked={ids.includes(p.id)} onChange={(e) => setIds((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id)))} />
                <Thumb image={p.image} hue={p.hue} title={p.title} className="h-9 w-9 text-xs" />
                <span className="flex-1 text-sm font-semibold">{p.title}</span>
                {p.status !== "active" && <span className="text-xs text-muted">Brouillon</span>}
              </label>
            </li>
          ))}
          {!products.length && <li className="px-5 py-8 text-center text-sm text-muted">Ajoutez d'abord des produits.</li>}
        </ul>
      </section>
    </form>
  );
}
