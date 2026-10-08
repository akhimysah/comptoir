"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isImageUrl } from "@/lib/images";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseMoney } from "@/lib/money";
import { slugify } from "@/lib/utils";

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
        sku: z.string().max(60),
        stock: z.number().int().min(0).max(1_000_000),
      }),
    )
    .min(1)
    .max(100),
  collectionIds: z.array(z.string()).max(50),
});
export type ProductPayload = z.infer<typeof payloadSchema>;
export type SaveState = { error?: string } | undefined;

async function uniqueHandle(storeId: string, title: string, exceptId?: string) {
  const base = slugify(title);
  let handle = base;
  for (let i = 2; ; i++) {
    const hit = await db.product.findUnique({ where: { storeId_handle: { storeId, handle } } });
    if (!hit || hit.id === exceptId) return handle;
    handle = `${base}-${i}`;
  }
}

export async function saveProduct(_: SaveState, form: FormData): Promise<SaveState> {
  const { store } = await requireStore();
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("payload")));
  } catch {
    return { error: "Le formulaire est illisible. Rechargez la page." };
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = parsed.data;

  const variants = [];
  for (const [i, v] of p.variants.entries()) {
    const priceCents = parseMoney(v.price);
    if (priceCents === null) return { error: `Indiquez un prix valide${p.variants.length > 1 ? ` pour ${v.optionValues.join(" / ")}` : ""}.` };
    const compareAtCents = parseMoney(v.compareAt);
    variants.push({
      id: v.id,
      title: v.optionValues.length ? v.optionValues.join(" / ") : "Par défaut",
      optionValues: JSON.stringify(v.optionValues),
      priceCents,
      compareAtCents: compareAtCents && compareAtCents > priceCents ? compareAtCents : null,
      sku: v.sku.trim(),
      stock: v.stock,
      position: i,
    });
  }

  if (p.id) {
    const existing = await db.product.findFirst({ where: { id: p.id, storeId: store.id }, include: { variants: true } });
    if (!existing) return { error: "Ce produit n'existe plus." };
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
          handle: await uniqueHandle(store.id, p.title, p.id),
          description: p.description,
          status: p.status,
          hue: p.hue,
          images: JSON.stringify(p.images),
          options: JSON.stringify(p.options),
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
        variants: { create: variants.map(({ id: _id, ...v }) => v) },
        collections: { create: await validCollections(store.id, p.collectionIds) },
      },
    });
    p.id = created.id;
  }
  revalidatePath("/admin/products");
  revalidatePath(`/s/${store.slug}`, "layout");
  redirect(`/admin/products/${p.id}?saved=1`);
}

async function validCollections(storeId: string, ids: string[]) {
  const found = await db.collection.findMany({ where: { storeId, id: { in: ids } }, select: { id: true } });
  return found.map((c) => ({ collectionId: c.id }));
}

export async function deleteProduct(form: FormData) {
  const { store } = await requireStore();
  await db.product.deleteMany({ where: { id: String(form.get("id")), storeId: store.id } });
  revalidatePath(`/s/${store.slug}`, "layout");
  redirect("/admin/products");
}
