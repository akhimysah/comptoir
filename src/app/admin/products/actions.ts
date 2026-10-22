"use server";

import { logActivity } from "@/lib/activity";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isImageUrl } from "@/lib/images";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { addAutoRedirect } from "@/lib/navigation";
import { notifyBackInStock } from "@/lib/stock-alerts";
import { uniqueHandle } from "@/lib/handles";
import { cleanMetafields } from "@/lib/metafields";
import { parseMoney } from "@/lib/money";
import { PRIMARY } from "@/lib/locations";
import { logAdjustment } from "@/lib/inventory-log";

const payloadSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, "Donnez un titre au produit.").max(120),
  description: z.string().max(5000),
  status: z.enum(["draft", "active"]),
  hue: z.number().int().min(0).max(359),
  images: z.array(z.string().refine(isImageUrl, "Image invalide.")).max(10),
  options: z
    .array(z.object({ name: z.string().trim().min(1, "Chaque option a besoin d'un nom.").max(30), values: z.array(z.string().trim().min(1).max(40)).min(1, "Chaque option a besoin d'au moins une valeur.").max(30) }))
    .max(3),
  variants: z
    .array(
      z.object({
        id: z.string().optional(),
        optionValues: z.array(z.string()),
        price: z.string(),
        compareAt: z.string(),
        cost: z.string().optional().default(""),
        image: z.string().max(500).nullable().optional(),
        weight: z.string().max(20).optional().default(""),
        sku: z.string().max(60),
        barcode: z.string().trim().max(40, "Le code-barres ne peut pas dépasser 40 caractères.").optional().default(""),
        // Taille du produit emballé, saisie en cm (gardée en mm).
        lengthCm: z.string().max(10).optional().default(""),
        widthCm: z.string().max(10).optional().default(""),
        heightCm: z.string().max(10).optional().default(""),
        stock: z.number().int().min(0).max(1_000_000),
      }),
    )
    .min(1)
    .max(100),
  collectionIds: z.array(z.string()).max(50),
  seoTitle: z.string().max(70).optional().default(""),
  seoDescription: z.string().max(320).optional().default(""),
  isGiftCard: z.boolean().optional().default(false),
  continueSelling: z.boolean().optional().default(false),
  subscriptionInterval: z.enum(["", "week", "month"]).optional().default(""),
  subscriptionDiscountPct: z.number().min(0).max(90).optional().default(0),
  bundle: z.array(z.object({ variantId: z.string(), quantity: z.number().int().min(1).max(99) })).max(30).optional().default([]),
  metafields: z.record(z.string().max(2000)).optional().default({}),
  complementaryIds: z.array(z.string().max(40)).max(6).optional().default([]),
  // Organisation du produit (comme Shopify) : catégorie, type, fournisseur, balises, taxe.
  category: z.string().trim().max(100, "La catégorie ne peut pas dépasser 100 caractères.").optional().default(""),
  productType: z.string().trim().max(100, "Le type de produit ne peut pas dépasser 100 caractères.").optional().default(""),
  vendor: z.string().trim().max(100, "Le nom du fournisseur ne peut pas dépasser 100 caractères.").optional().default(""),
  tags: z.array(z.string().trim().min(1).max(50, "Une balise ne peut pas dépasser 50 caractères.")).max(50, "50 balises maximum.").optional().default([]),
  taxable: z.boolean().optional().default(true),
});

/** Dimension saisie en cm → millimètres (null si vide) ; undefined si invalide ou hors limites (0 à 500 cm). */
function toMm(cm: string): number | null | undefined {
  if (!cm.trim()) return null;
  const n = Number(cm.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return undefined;
  const mm = Math.round(n * 10);
  return mm > 5000 ? undefined : mm;
}

export type ProductPayload = z.infer<typeof payloadSchema>;
export type SaveState = { error?: string } | undefined;

export async function saveProduct(_: SaveState, form: FormData): Promise<SaveState> {
  const { store, user } = await requirePerm("products");
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("payload")));
  } catch {
    return { error: "Le formulaire est illisible. Rechargez la page." };
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = parsed.data;
  const defs = await db.metafieldDefinition.findMany({ where: { storeId: store.id, owner: "product" } });
  const meta = cleanMetafields(defs, p.metafields);
  if (meta.error) return { error: meta.error };
  // Produits complémentaires : seulement des produits de cette boutique, jamais lui-même, ordre conservé.
  const allowed = new Set((await db.product.findMany({ where: { storeId: store.id, id: { in: p.complementaryIds } }, select: { id: true } })).map((x) => x.id));
  const complementaryIds = JSON.stringify([...new Set(p.complementaryIds)].filter((id) => allowed.has(id) && id !== p.id));

  const variants = [];
  for (const [i, v] of p.variants.entries()) {
    const priceCents = parseMoney(v.price);
    if (priceCents === null) return { error: `Indiquez un prix valide${p.variants.length > 1 ? ` pour ${v.optionValues.join(" / ")}` : ""}.` };
    const compareAtCents = parseMoney(v.compareAt);
    const costCents = v.cost.trim() ? parseMoney(v.cost) : null;
    if (v.cost.trim() && costCents === null) return { error: `Coût par article invalide${p.variants.length > 1 ? ` pour ${v.optionValues.join(" / ")}` : ""}.` };
    const [lengthMm, widthMm, heightMm] = [toMm(v.lengthCm), toMm(v.widthCm), toMm(v.heightCm)];
    if (lengthMm === undefined || widthMm === undefined || heightMm === undefined) return { error: `Taille du produit emballé invalide${p.variants.length > 1 ? ` pour ${v.optionValues.join(" / ")}` : ""} : indiquez des dimensions en cm, entre 0 et 500.` };
    variants.push({
      id: v.id,
      title: v.optionValues.length ? v.optionValues.join(" / ") : "Par défaut",
      optionValues: JSON.stringify(v.optionValues),
      priceCents,
      compareAtCents: compareAtCents && compareAtCents > priceCents ? compareAtCents : null,
      costCents,
      // La photo d'une variante doit être l'une des photos du produit.
      image: v.image && p.images.includes(v.image) ? v.image : null,
      // Poids saisi en kg, gardé en grammes.
      weightGrams: (() => { const n = Number(v.weight.replace(",", ".")); return v.weight.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : 0; })(),
      sku: v.sku.trim(),
      barcode: v.barcode,
      lengthMm, widthMm, heightMm,
      stock: v.stock,
      position: i,
    });
  }
  const organisation = { category: p.category, productType: p.productType, vendor: p.vendor, tags: [...new Set(p.tags)].join(", "), taxable: p.taxable };
  // Stock avant enregistrement, par variante : chaque écart est tracé dans l'historique des ajustements.
  const before = new Map<string, number>();

  if (p.id) {
    const existing = await db.product.findFirst({ where: { id: p.id, storeId: store.id }, include: { variants: true } });
    if (!existing) return { error: "Ce produit n'existe plus." };
    for (const v of existing.variants) before.set(v.id, v.stock);
    const handle = await uniqueHandle(store.id, p.title, p.id);
    if (existing.handle !== handle) await addAutoRedirect(store.id, `/p/${existing.handle}`, `/p/${handle}`);
    const keep = new Set(variants.map((v) => v.id).filter((id): id is string => !!id && existing.variants.some((e) => e.id === id)));
    await db.$transaction([
      db.variant.deleteMany({ where: { productId: p.id, id: { notIn: [...keep] } } }),
      ...variants.map(({ id, ...data }) =>
        id && keep.has(id) ? db.variant.update({ where: { id }, data }) : db.variant.create({ data: { ...data, productId: p.id! } }),
      ),
      db.productCollection.deleteMany({ where: { productId: p.id } }),
      db.product.update({
        where: { id: p.id },
        data: {
          title: p.title,
          handle,
          description: p.description,
          status: p.status,
          hue: p.hue,
          images: JSON.stringify(p.images),
          options: JSON.stringify(p.options),
          seoTitle: p.seoTitle,
          seoDescription: p.seoDescription,
          metafields: JSON.stringify(meta.values),
          complementaryIds,
          isGiftCard: p.isGiftCard,
          continueSelling: p.continueSelling,
          subscriptionInterval: p.subscriptionInterval || null,
          subscriptionDiscountBps: Math.round(p.subscriptionDiscountPct * 100),
          ...organisation,
          collections: { create: await validCollections(store.id, p.collectionIds) },
        },
      }),
    ]);
  } else {
    const created = await db.product.create({
      data: {
        storeId: store.id,
        title: p.title,
        handle: await uniqueHandle(store.id, p.title),
        description: p.description,
        status: p.status,
        hue: p.hue,
        images: JSON.stringify(p.images),
        options: JSON.stringify(p.options),
        seoTitle: p.seoTitle,
        seoDescription: p.seoDescription,
        metafields: JSON.stringify(meta.values),
        complementaryIds,
        isGiftCard: p.isGiftCard,
        continueSelling: p.continueSelling,
        subscriptionInterval: p.subscriptionInterval || null,
        subscriptionDiscountBps: Math.round(p.subscriptionDiscountPct * 100),
        ...organisation,
        variants: { create: variants.map(({ id: _id, ...v }) => v) },
        collections: { create: await validCollections(store.id, p.collectionIds) },
      },
    });
    p.id = created.id;
  }
  // Composants du lot : uniquement des variantes de cette boutique, ni lots ni cartes cadeaux, et pas lui-même.
  const ok = p.bundle.length
    ? await db.variant.findMany({ where: { id: { in: p.bundle.map((b) => b.variantId) }, product: { storeId: store.id, isGiftCard: false, id: { not: p.id! }, bundleItems: { none: {} } } }, select: { id: true } })
    : [];
  await db.$transaction([
    db.bundleItem.deleteMany({ where: { bundleId: p.id! } }),
    ...p.bundle.filter((b) => ok.some((o) => o.id === b.variantId)).map((b) => db.bundleItem.create({ data: { bundleId: p.id!, variantId: b.variantId, quantity: b.quantity } })),
  ]);
  // Historique des ajustements : écart entre le stock d'avant et celui saisi (une variante nouvelle part de zéro).
  for (const v of await db.variant.findMany({ where: { productId: p.id! }, select: { id: true, stock: true } })) {
    await logAdjustment(db, { storeId: store.id, variantId: v.id, delta: v.stock - (before.get(v.id) ?? 0), after: v.stock, reason: "Modifié sur la fiche produit", author: user.name, locationId: PRIMARY });
  }
  await logActivity(`Produit « ${p.title} » enregistré`, `/admin/products/${p.id}`);
  await notifyBackInStock({ storeId: store.id });
  revalidatePath("/admin/products");
  revalidatePath("/admin/inventory");
  revalidatePath(`/s/${store.slug}`, "layout");
  redirect(`/admin/products/${p.id}?saved=1`);
}

async function validCollections(storeId: string, ids: string[]) {
  const found = await db.collection.findMany({ where: { storeId, id: { in: ids } }, select: { id: true } });
  return found.map((c) => ({ collectionId: c.id }));
}

export async function deleteProduct(form: FormData) {
  const { store } = await requirePerm("products");
  await db.product.deleteMany({ where: { id: String(form.get("id")), storeId: store.id } });
  await logActivity("Produit supprimé");

  revalidatePath(`/s/${store.slug}`, "layout");
  redirect("/admin/products");
}
