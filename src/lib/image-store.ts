import "server-only";
import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { put } from "@vercel/blob";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

/** Type réel d'après la signature du fichier (le type annoncé ne suffit pas). */
export function sniffImage(b: Buffer) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (/^GIF8[79]a/.test(b.subarray(0, 6).toString("latin1"))) return "gif";
  return null;
}

/** Enregistre une image vérifiée : Vercel Blob en production (BLOB_READ_WRITE_TOKEN), sinon le dossier local uploads/. */
export async function saveImage(bytes: Buffer): Promise<string | null> {
  const ext = sniffImage(bytes);
  if (!ext || bytes.length > MAX_IMAGE_BYTES) return null;
  const name = `${randomBytes(12).toString("hex")}.${ext}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`uploads/${name}`, bytes, { access: "public", contentType: MIME[ext], addRandomSuffix: false });
    return blob.url;
  }
  const dir = path.join(process.cwd(), "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
  return `/uploads/${name}`;
}

/**
 * Télécharge une photo d'une boutique Shopify. Seul le serveur d'images officiel de Shopify est autorisé
 * (jamais une adresse quelconque venue d'un fichier : notre serveur ne doit pas pouvoir être envoyé vers des adresses internes).
 */
export async function fetchShopifyImage(url: string): Promise<string | null> {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" || u.hostname !== "cdn.shopify.com" || u.port) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(u, { signal: ctrl.signal, redirect: "error" });
    if (!res.ok || !res.body) return null;
    if (Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) return null;
    // Lecture limitée : on s'arrête dès que la taille maximale est dépassée.
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_IMAGE_BYTES) { ctrl.abort(); return null; }
      chunks.push(value);
    }
    return await saveImage(Buffer.concat(chunks));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
