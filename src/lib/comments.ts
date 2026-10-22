import "server-only";
import type { Store } from "@prisma/client";
import { db } from "./db";
import { clientIp, hit } from "./rate-limit";

export type CommentsMode = "off" | "moderated" | "auto";
export const COMMENT_MODES: Record<CommentsMode, string> = { off: "Désactivés", moderated: "Autorisés, publiés après validation", auto: "Autorisés, publiés immédiatement" };
export const commentsMode = (store: Pick<Store, "blogComments">): CommentsMode => (store.blogComments === "moderated" || store.blogComments === "auto" ? store.blogComments : "off");

/** Dépôt d'un commentaire par un visiteur : vérifications, limite par adresse, statut selon le réglage de la boutique. */
export async function postComment(store: Pick<Store, "id" | "blogComments">, postId: string, input: { author: string; email: string; body: string }, locale: "fr" | "en" = "fr"): Promise<{ ok?: true; status?: "pending" | "published"; error?: string }> {
  const mode = commentsMode(store);
  if (mode === "off") return { error: locale === "en" ? "Comments are disabled." : "Les commentaires sont désactivés." };
  const author = input.author.trim().slice(0, 80), email = input.email.trim().toLowerCase(), body = input.body.trim().slice(0, 3000);
  if (!author || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || body.length < 2) return { error: locale === "en" ? "Please fill in your name, a valid email and your comment." : "Indiquez votre nom, un e-mail valide et votre commentaire." };
  const ip = await clientIp();
  if (!(await hit(`comment:${store.id}:${ip}`, 5, 3600_000))) return { error: locale === "en" ? "Too many comments, try again later." : "Trop de commentaires envoyés, réessayez plus tard." };
  const post = await db.blogPost.findFirst({ where: { id: postId, storeId: store.id, published: true } });
  if (!post) return { error: locale === "en" ? "Article not found." : "Article introuvable." };
  const status = mode === "auto" ? "published" : "pending";
  await db.blogComment.create({ data: { storeId: store.id, postId: post.id, author, email, body, status, ip } });
  return { ok: true, status };
}

export const publishedComments = (postId: string) => db.blogComment.findMany({ where: { postId, status: "published" }, orderBy: { createdAt: "asc" } });
