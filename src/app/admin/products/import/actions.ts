"use server";

import { logActivity } from "@/lib/activity";

import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { parseCsv, PRODUCT_COLUMNS } from "@/lib/csv";
import { db } from "@/lib/db";
import { parseMoney } from "@/lib/money";
import { parseJson, slugify } from "@/lib/utils";

export type ImportResult = { created: number; updated: number; errors: string[] } | { error: string } | undefined;

type Row = Record<(typeof PRODUCT_COLUMNS)[number], string> & { line: number };

export async function importProducts(_: ImportResult, form: FormData): Promise<ImportResult> {
  const { store } = await requirePerm("products");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choisissez un fichier CSV." };
  if (file.size > 2 * 1024 * 1024) return { error: "Le fichier dépasse 2 Mo." };

  const table = parseCsv(await file.text());
  const header = (table[0] ?? []).map((h) => h.trim());
  const missing = ["Titre", "Prix"].filter((c) => !header.includes(c));
  if (missing.length) return { error: `Colonnes manquantes : ${missing.join(", ")}. Partez d'un export pour avoir le bon format.` };
  if (table.length > 3001) return { error: "3 000 lignes maximum par import." };

  const rows: Row[] = table.slice(1).map((cells, i) => {
    const r = { line: i + 2 } as Row;
    PRODUCT_COLUMNS.forEach((c) => { const k = header.indexOf(c); r[c] = k >= 0 ? (cells[k] ?? "").trim().slice(0, c === "Description" ? 20000 : 255) : ""; });
    return r;
  });

  // Une ligne avec un titre ouvre un produit ; les lignes suivantes sans titre (même identifiant) sont ses variantes.
  const groups: Row[][] = [];
  for (const r of rows) {
    const prev = groups.at(-1);
    const sameHandle = prev && r.Identifiant && prev[0].Identifiant === r.Identifiant;
    if (r.Titre || !prev || (r.Identifiant && !sameHandle)) groups.push([r]);
    else prev.push(r);
  }

  const errors: string[] = [];
  let created = 0, updated = 0;
  const collectionCache = new Map<string, string>();
  const collectionId = async (title: string) => {
    const key = title.toLowerCase();
    if (collectionCache.has(key)) return collectionCache.get(key)!;
    // Une collection existante est reprise par son nom (sans tenir compte des majuscules), quel que soit son identifiant.
    const all = await db.collection.findMany({ where: { storeId: store.id }, select: { id: true, title: true } });
    const same = all.find((x) => x.title.toLowerCase() === key);
    if (same) { collectionCache.set(key, same.id); return same.id; }
    const handle = slugify(title);
    const c = await db.collection.upsert({ where: { storeId_handle: { storeId: store.id, handle } }, update: {}, create: { storeId: store.id, handle, title } });
    collectionCache.set(key, c.id);
    return c.id;
  };

  for (const g of groups) {
    const head = g[0];
    if (!head.Titre && !head.Identifiant) { errors.push(`Ligne ${head.line} : titre manquant.`); continue; }
    const optionNames = [head["Option1 nom"], head["Option2 nom"], head["Option3 nom"]].filter(Boolean);
    const variants: { title: string; optionValues: string; priceCents: number; compareAtCents: number | null; sku: string; stock: number; position: number }[] = [];
    let bad = false;
    for (const [i, r] of g.entries()) {
      const price = parseMoney(r.Prix);
      if (price === null) { errors.push(`Ligne ${r.line} : prix invalide « ${r.Prix} ».`); bad = true; break; }
      const compare = parseMoney(r["Prix avant réduction"]);
      const values = [r["Option1 valeur"], r["Option2 valeur"], r["Option3 valeur"]].slice(0, optionNames.length);
      if (optionNames.length && values.some((v) => !v)) { errors.push(`Ligne ${r.line} : valeur d'option manquante.`); bad = true; break; }
      const stock = r.Stock ? Math.floor(Number(r.Stock.replace(",", "."))) : 0;
      variants.push({
        title: values.length ? values.join(" / ") : "Par défaut",
        optionValues: JSON.stringify(values),
        priceCents: price,
        compareAtCents: compare && compare > price ? compare : null,
        sku: r.SKU,
        stock: Number.isFinite(stock) && stock > 0 ? stock : 0,
        position: i,
      });
    }
    if (bad) continue;

    const options = optionNames.map((name, k) => ({ name, values: [...new Set(variants.map((v) => parseJson<string[]>(v.optionValues, [])[k]))] }));
    const handle = slugify(head.Identifiant || head.Titre);
    const existing = await db.product.findUnique({ where: { storeId_handle: { storeId: store.id, handle } }, include: { variants: true } });
    const colIds = head.Collections ? await Promise.all(head.Collections.split(/[,|]/).map((t) => t.trim()).filter(Boolean).map(collectionId)) : null;
    const status = /^brouillon|draft/i.test(head.Statut) ? "draft" : head.Statut ? "active" : undefined;

    if (existing) {
      // Les variantes existantes (mêmes valeurs d'options) gardent leur identifiant, pour ne pas casser les paniers en cours.
      const byKey = new Map(existing.variants.map((v) => [v.optionValues, v]));
      const keep = new Set<string>();
      await db.$transaction(async (tx) => {
        for (const v of variants) {
          const hit = byKey.get(v.optionValues);
          if (hit) { keep.add(hit.id); await tx.variant.update({ where: { id: hit.id }, data: v }); }
          else await tx.variant.create({ data: { ...v, productId: existing.id } });
        }
        await tx.variant.deleteMany({ where: { productId: existing.id, id: { notIn: [...keep] }, NOT: { optionValues: { in: variants.map((v) => v.optionValues) } } } });
        await tx.product.update({
          where: { id: existing.id },
          data: {
            ...(head.Titre ? { title: head.Titre } : {}),
            ...(head.Description ? { description: head.Description } : {}),
            ...(status ? { status } : {}),
            options: JSON.stringify(options),
          },
        });
        if (colIds) {
          await tx.productCollection.deleteMany({ where: { productId: existing.id } });
          await tx.productCollection.createMany({ data: colIds.map((collectionId) => ({ productId: existing.id, collectionId })) });
        }
      });
      updated++;
    } else {
      if (!head.Titre) { errors.push(`Ligne ${head.line} : « ${head.Identifiant} » n'existe pas et n'a pas de titre.`); continue; }
      await db.product.create({
        data: {
          storeId: store.id, handle, title: head.Titre, description: head.Description, status: status ?? "active",
          hue: Math.floor(Math.random() * 360), options: JSON.stringify(options),
          variants: { create: variants },
          ...(colIds ? { collections: { create: colIds.map((collectionId) => ({ collectionId })) } } : {}),
        },
      });
      created++;
    }
  }
  await logActivity(`Import CSV : ${created} produit(s) créé(s), ${updated} mis à jour`, "/admin/products");
  revalidatePath("/admin/products");
  revalidatePath(`/s/${store.slug}`, "layout");
  return { created, updated, errors: errors.slice(0, 50) };
}
