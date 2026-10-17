import { NextResponse } from "next/server";
import { logActivity } from "@/lib/activity";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { pushThemeLater } from "@/lib/github";
import { storeUpdateFromFiles } from "@/lib/theme-files";
import { buildThemeZip, readThemeZip, THEME_ZIP_MAX_BYTES } from "@/lib/theme-zip";
import { slugify } from "@/lib/utils";
import { revalidatePath } from "next/cache";

/** Téléchargement du thème actuel en .zip. */
export async function GET() {
  const { store } = await requirePerm("content");
  const zip = buildThemeZip(store);
  return new NextResponse(Buffer.from(zip), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="theme-${slugify(store.name) || "boutique"}-${new Date().toISOString().slice(0, 10)}.zip"`, "Cache-Control": "no-store" },
  });
}

/** Import d'un thème .zip : chaque fichier est vérifié comme dans l'éditeur, puis le thème est publié. */
export async function POST(req: Request) {
  const { store } = await requirePerm("content");
  const back = (kind: "zipok" | "ziperr", msg: string) => NextResponse.redirect(new URL(`/admin/theme?${kind}=${encodeURIComponent(msg)}#fichiers`, req.url), 303);
  const form = await req.formData().catch(() => null);
  const file = form?.get("zip");
  if (!(file instanceof File) || !file.size) return back("ziperr", "Choisissez un fichier .zip.");
  if (file.size > THEME_ZIP_MAX_BYTES) return back("ziperr", "Fichier trop lourd (2 Mo maximum).");
  const read = readThemeZip(new Uint8Array(await file.arrayBuffer()));
  if ("error" in read) return back("ziperr", read.error);
  const { data, error } = storeUpdateFromFiles(store, read.files);
  if (error) return back("ziperr", error);
  await db.store.update({ where: { id: store.id }, data: { ...data, ...(data.theme ? { themeUpdatedAt: new Date() } : {}) } });
  await logActivity(`Thème importé depuis un fichier .zip (${file.name})`, "/admin/theme");
  await pushThemeLater(store.id, `Thème importé depuis ${file.name}`);
  revalidatePath(`/s/${store.slug}`, "layout");
  revalidatePath("/admin/theme");
  const parts = [data.theme && "thème", data.customCss !== undefined && "CSS", data.translations && "traductions"].filter(Boolean).join(", ");
  return back("zipok", `Thème importé et publié (${parts}).`);
}
