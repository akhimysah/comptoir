import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const MAX = 5 * 1024 * 1024;

// Vercel Blob quand BLOB_READ_WRITE_TOKEN est défini (production), sinon le dossier local uploads/.
export async function POST(req: Request) {
  if (!(await getUser())) return NextResponse.json({ error: "Connectez-vous pour envoyer des images." }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Format accepté : JPG, PNG, WebP ou GIF." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "L'image dépasse 5 Mo." }, { status: 400 });

  const name = `${randomBytes(12).toString("hex")}.${ext}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`uploads/${name}`, file, { access: "public", contentType: file.type, addRandomSuffix: false });
    return NextResponse.json({ url: blob.url });
  }
  const dir = path.join(process.cwd(), "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ url: `/uploads/${name}` });
}
