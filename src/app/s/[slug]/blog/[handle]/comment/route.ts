import { NextResponse } from "next/server";
import { postComment } from "@/lib/comments";
import { db } from "@/lib/db";
import { getLocale } from "@/lib/locale";
import { storeAccess } from "@/lib/store-access";

/** Commentaire déposé depuis la page d'article native : retour sur l'article avec le résultat. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string; handle: string }> }) {
  const { slug, handle } = await params;
  const store = await db.store.findUnique({ where: { slug } });
  const back = (r: string) => NextResponse.redirect(new URL(`/s/${slug}/blog/${handle}?comment=${r}#comments`, req.url), 303);
  if (!store || !(await storeAccess(store)).allowed) return back("err");
  const post = await db.blogPost.findFirst({ where: { storeId: store.id, handle, published: true } });
  if (!post) return back("err");
  const form = await req.formData().catch(() => null);
  const r = await postComment(store, post.id, { author: String(form?.get("author") ?? ""), email: String(form?.get("email") ?? ""), body: String(form?.get("body") ?? "") }, await getLocale(store));
  return back(r.ok ? (r.status === "published" ? "ok" : "pending") : "err");
}
