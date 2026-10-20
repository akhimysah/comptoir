"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteMediaFile } from "@/lib/media-files";

/** Texte alternatif d'un fichier (accessibilité, référencement). */
export async function saveFileAlt(id: string, alt: string) {
  const { store } = await requirePerm("content");
  const file = await db.mediaFile.findFirst({ where: { id, storeId: store.id } });
  if (!file) return { error: "Fichier introuvable." };
  await db.mediaFile.update({ where: { id }, data: { alt: alt.trim().slice(0, 300) } });
  revalidatePath("/admin/content/files");
  return { ok: true };
}

export async function removeFile(id: string) {
  const { store } = await requirePerm("content");
  const file = await deleteMediaFile(store.id, id);
  if (!file) return { error: "Fichier introuvable." };
  await logActivity(`Fichier supprimé : ${file.name}`, "/admin/content/files");
  revalidatePath("/admin/content/files");
  return { ok: true };
}
