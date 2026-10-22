"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";

const refresh = (slug: string) => { revalidatePath("/admin/blog/comments"); revalidatePath(`/s/${slug}`, "layout"); };

/** Réglage des commentaires : désactivés, modérés ou publiés immédiatement. */
export async function setCommentsMode(form: FormData) {
  const { store } = await requirePerm("content");
  const mode = String(form.get("mode") ?? "off");
  if (!["off", "moderated", "auto"].includes(mode)) return;
  await db.store.update({ where: { id: store.id }, data: { blogComments: mode } });
  await logActivity(`Commentaires de blog : ${mode === "off" ? "désactivés" : mode === "moderated" ? "modérés" : "publiés automatiquement"}`, "/admin/blog/comments");
  refresh(store.slug);
}

/** Modération : publier, marquer indésirable ou supprimer. */
export async function moderateComment(form: FormData) {
  const { store } = await requirePerm("content");
  const id = String(form.get("id") ?? "");
  const action = String(form.get("action") ?? "");
  const c = await db.blogComment.findFirst({ where: { id, storeId: store.id } });
  if (!c) return;
  if (action === "delete") await db.blogComment.delete({ where: { id } });
  else if (action === "publish" || action === "spam" || action === "pending") await db.blogComment.update({ where: { id }, data: { status: action === "publish" ? "published" : action } });
  refresh(store.slug);
}
