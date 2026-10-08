"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";

const schema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, "Donnez un titre à la collection.").max(80),
  description: z.string().max(2000),
  image: z.string().regex(/^\/uploads\/[a-f0-9]{24}\.(jpg|png|webp|gif)$/).nullable(),
  productIds: z.array(z.string()).max(500),
});
export type CollectionPayload = z.infer<typeof schema>;

export async function saveCollection(_: { error?: string } | undefined, form: FormData) {
  const { store } = await requireStore();
  let raw: unknown = null;
  try { raw = JSON.parse(String(form.get("payload") ?? "")); } catch {}
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const c = parsed.data;

  const base = slugify(c.title);
  let handle = base;
  for (let i = 2; ; i++) {
    const hit = await db.collection.findUnique({ where: { storeId_handle: { storeId: store.id, handle } } });
    if (!hit || hit.id === c.id) break;
    handle = `${base}-${i}`;
  }
  const products = await db.product.findMany({ where: { storeId: store.id, id: { in: c.productIds } }, select: { id: true } });
  const links = products.map((p) => ({ productId: p.id }));

  let id = c.id;
  if (id) {
    const existing = await db.collection.findFirst({ where: { id, storeId: store.id } });
    if (!existing) return { error: "Cette collection n'existe plus." };
    await db.$transaction([
      db.productCollection.deleteMany({ where: { collectionId: id } }),
      db.collection.update({ where: { id }, data: { title: c.title, handle, description: c.description, image: c.image, products: { create: links } } }),
    ]);
  } else {
    id = (await db.collection.create({ data: { storeId: store.id, title: c.title, handle, description: c.description, image: c.image, products: { create: links } } })).id;
  }
  revalidatePath(`/s/${store.slug}`, "layout");
  redirect(`/admin/collections/${id}?saved=1`);
}

export async function deleteCollection(form: FormData) {
  const { store } = await requireStore();
  await db.collection.deleteMany({ where: { id: String(form.get("id")), storeId: store.id } });
  revalidatePath(`/s/${store.slug}`, "layout");
  redirect("/admin/collections");
}
