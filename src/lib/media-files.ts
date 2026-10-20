import "server-only";
import { unlink } from "fs/promises";
import path from "path";
import { db } from "./db";

/** Bibliothèque de fichiers de la boutique (Contenu › Fichiers) : chaque image envoyée y est référencée. */

/** Enregistre (ou met à jour) un fichier envoyé. Une même adresse n'apparaît qu'une fois par boutique. */
export async function registerMediaFile(storeId: string, file: { url: string; name: string; mime?: string; size?: number }) {
  const name = (file.name || path.basename(file.url)).trim().slice(0, 200) || "image";
  return db.mediaFile.upsert({
    where: { storeId_url: { storeId, url: file.url } },
    create: { storeId, url: file.url, name, mime: file.mime ?? "", size: file.size ?? 0 },
    update: { name, mime: file.mime ?? "", size: file.size ?? 0 },
  });
}

/** Supprime la fiche et, pour un fichier stocké localement (uploads/), le fichier lui-même. Les blobs distants restent en place. */
export async function deleteMediaFile(storeId: string, id: string) {
  const file = await db.mediaFile.findFirst({ where: { id, storeId } });
  if (!file) return null;
  await db.mediaFile.delete({ where: { id: file.id } });
  if (/^\/uploads\/[a-f0-9]+\.(jpg|png|webp|gif)$/.test(file.url)) {
    try { await unlink(path.join(process.cwd(), "uploads", path.basename(file.url))); } catch {}
  }
  return file;
}

/** Où le fichier est utilisé : nombre de produits dont les images le contiennent, et le thème publié. */
export async function mediaFileReferences(storeId: string, urls: string[]) {
  const [products, store] = await Promise.all([
    db.product.findMany({ where: { storeId, images: { not: "[]" } }, select: { images: true } }),
    db.store.findUnique({ where: { id: storeId }, select: { theme: true } }),
  ]);
  const out = new Map<string, { products: number; theme: boolean }>();
  for (const url of urls) {
    const needle = JSON.stringify(url);
    out.set(url, { products: products.filter((p) => p.images.includes(needle)).length, theme: Boolean(store?.theme.includes(url)) });
  }
  return out;
}
