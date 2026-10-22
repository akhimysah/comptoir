"use server";

import { logActivity } from "@/lib/activity";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { cleanMetafields } from "@/lib/metafields";
import { addAutoRedirect } from "@/lib/navigation";
import { isImageUrl } from "@/lib/images";
import { slugify } from "@/lib/utils";

const schema = z.object({
  kind: z.enum(["page", "post"]),
  id: z.string().optional(),
  title: z.string().trim().min(1, "Donnez un titre.").max(120),
  handle: z.string().trim().max(80).optional().default(""),
  body: z.string().max(50_000),
  excerpt: z.string().max(400).optional().default(""),
  author: z.string().max(80).optional().default(""),
  image: z.string().nullable().optional().default(null),
  published: z.boolean(),
  showInFooter: z.boolean().optional().default(true),
  seoTitle: z.string().max(70).optional().default(""),
  seoDescription: z.string().max(320).optional().default(""),
  metafields: z.record(z.string()).optional().default({}),
});
export type ContentPayload = z.infer<typeof schema>;

export async function saveContent(_: { error?: string } | undefined, form: FormData) {
  const { user, store } = await requirePerm("content");
  let raw: unknown = null;
  try { raw = JSON.parse(String(form.get("payload") ?? "")); } catch {}
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const c = parsed.data;
  if (c.image && !isImageUrl(c.image)) return { error: "Image invalide." };

  const model = c.kind === "page" ? db.page : db.blogPost;
  const base = slugify(c.handle || c.title);
  let handle = base;
  for (let i = 2; ; i++) {
    const hit = await (model as typeof db.page).findUnique({ where: { storeId_handle: { storeId: store.id, handle } } });
    if (!hit || hit.id === c.id) break;
    handle = `${base}-${i}`;
  }
  const before = c.id ? await (model as typeof db.page).findFirst({ where: { id: c.id, storeId: store.id }, select: { handle: true } }) : null;
  if (before && before.handle !== handle) await addAutoRedirect(store.id, `/${c.kind === "page" ? "pages" : "blog"}/${before.handle}`, `/${c.kind === "page" ? "pages" : "blog"}/${handle}`);
  const common = { title: c.title, handle, body: c.body, published: c.published, seoTitle: c.seoTitle, seoDescription: c.seoDescription };
  let id = c.id;
  if (c.kind === "page") {
    const defs = await db.metafieldDefinition.findMany({ where: { storeId: store.id, owner: "page" } });
    const meta = cleanMetafields(defs, c.metafields);
    if (meta.error) return { error: meta.error };
    const data = { ...common, showInFooter: c.showInFooter, metafields: JSON.stringify(meta.values ?? {}) };
    if (id) { const r = await db.page.updateMany({ where: { id, storeId: store.id }, data }); if (!r.count) return { error: "Cette page n'existe plus." }; }
    else id = (await db.page.create({ data: { ...data, storeId: store.id } })).id;
  } else {
    const existing = id ? await db.blogPost.findFirst({ where: { id, storeId: store.id } }) : null;
    if (id && !existing) return { error: "Cet article n'existe plus." };
    const data = { ...common, excerpt: c.excerpt, author: c.author || user.name, image: c.image, publishedAt: c.published ? existing?.publishedAt ?? new Date() : existing?.publishedAt ?? null };
    if (existing) await db.blogPost.update({ where: { id: existing.id }, data });
    else id = (await db.blogPost.create({ data: { ...data, storeId: store.id } })).id;
  }
  await logActivity(`${c.kind === "page" ? "Page" : "Article"} « ${c.title} » enregistré${c.kind === "page" ? "e" : ""}`, `/admin/${c.kind === "page" ? "pages" : "blog"}/${id}`);
  revalidatePath(`/s/${store.slug}`, "layout");
  redirect(`/admin/${c.kind === "page" ? "pages" : "blog"}/${id}?saved=1`);
}

export async function deleteContent(form: FormData) {
  const { store } = await requirePerm("content");
  const kind = form.get("kind") === "page" ? "page" : "post";
  const id = String(form.get("id"));
  if (kind === "page") await db.page.deleteMany({ where: { id, storeId: store.id } });
  else await db.blogPost.deleteMany({ where: { id, storeId: store.id } });
  revalidatePath(`/s/${store.slug}`, "layout");
  redirect(kind === "page" ? "/admin/pages" : "/admin/blog");
}
