import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getUser, storesWithPerm } from "@/lib/auth";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const MAX = 5 * 1024 * 1024;

// Vercel Blob quand BLOB_READ_WRITE_TOKEN est défini (production), sinon le dossier local uploads/.
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Connectez-vous pour envoyer des images." }, { status: 401 });
  if (!(await storesWithPerm(user.id, "products")).length && !(await storesWithPerm(user.id, "content")).length)
    return NextResponse.json({ error: "Vous n'avez pas le droit d'envoyer des images." }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Format accepté : JPG, PNG, WebP ou GIF." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "L'image dépasse 5 Mo." }, { status: 400 });
  // Le type annoncé par le navigateur ne suffit pas : on vérifie la signature réelle du fichier.
  const bytes = Buffer.from(await file.arrayBuffer());
  if (sniff(bytes) !== ext) return NextResponse.json({ error: "Ce fichier n'est pas une image valide." }, { status: 400 });

  const name = `${randomBytes(12).toString("hex")}.${ext}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`uploads/${name}`, bytes, { access: "public", contentType: file.type, addRandomSuffix: false });
    return NextResponse.json({ url: blob.url });
  }
  const dir = path.join(process.cwd(), "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
  return NextResponse.json({ url: `/uploads/${name}` });
}

function sniff(b: Buffer) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (/^GIF8[79]a/.test(b.subarray(0, 6).toString("latin1"))) return "gif";
  return null;
}
