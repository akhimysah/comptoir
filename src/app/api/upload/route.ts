import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUser, STORE_COOKIE, storesWithPerm } from "@/lib/auth";
import { MAX_IMAGE_BYTES as MAX, saveImage, sniffImage } from "@/lib/image-store";
import { registerMediaFile } from "@/lib/media-files";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

// Vercel Blob quand BLOB_READ_WRITE_TOKEN est défini (production), sinon le dossier local uploads/.
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Connectez-vous pour envoyer des images." }, { status: 401 });
  const stores = [...(await storesWithPerm(user.id, "products")), ...(await storesWithPerm(user.id, "content"))];
  if (!stores.length) return NextResponse.json({ error: "Vous n'avez pas le droit d'envoyer des images." }, { status: 403 });
  // Boutique active (menu du haut) : le fichier est rangé dans sa bibliothèque Contenu › Fichiers.
  const wanted = (await cookies()).get(STORE_COOKIE)?.value;
  const store = stores.find((s) => s.id === wanted) ?? stores[0];
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Format accepté : JPG, PNG, WebP ou GIF." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "L'image dépasse 5 Mo." }, { status: 400 });
  // Le type annoncé par le navigateur ne suffit pas : on vérifie la signature réelle du fichier.
  const bytes = Buffer.from(await file.arrayBuffer());
  if (sniffImage(bytes) !== ext) return NextResponse.json({ error: "Ce fichier n'est pas une image valide." }, { status: 400 });
  const url = await saveImage(bytes);
  if (!url) return NextResponse.json({ error: "Ce fichier n'est pas une image valide." }, { status: 400 });
  try { await registerMediaFile(store.id, { url, name: file.name, mime: file.type, size: file.size }); } catch {}
  return NextResponse.json({ url });
}