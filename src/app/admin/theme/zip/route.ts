import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { logActivity } from "@/lib/activity";
import { requirePerm } from "@/lib/auth";
import { storeUpdateFromFiles } from "@/lib/theme-files";
import { readThemeZip, THEME_ZIP_MAX_BYTES } from "@/lib/theme-zip";
import { createTheme, uniqueThemeName } from "@/lib/themes";

/** « Charger un fichier zip » : le thème importé devient un brouillon (fichiers vérifiés comme dans l'éditeur). */
export async function POST(req: Request) {
  const { store } = await requirePerm("content");
  const back = (kind: "ok" | "err", msg: string) => NextResponse.redirect(new URL(`/admin/theme?${kind}=${encodeURIComponent(msg)}`, req.url), 303);
  const form = await req.formData().catch(() => null);
  const file = form?.get("zip");
  if (!(file instanceof File) || !file.size) return back("err", "Choisissez un fichier .zip.");
  if (file.size > THEME_ZIP_MAX_BYTES) return back("err", "Fichier trop lourd (2 Mo maximum).");
  const read = readThemeZip(new Uint8Array(await file.arrayBuffer()));
  if ("error" in read) return back("err", read.error);
  const { data, error } = storeUpdateFromFiles({ translations: "{}" }, read.files);
  if (error || !data.theme) return back("err", error ?? "theme.json manquant.");
  const name = await uniqueThemeName(store.id, file.name.replace(/\.zip$/i, "").replace(/[-_]+/g, " ").trim() || "Thème importé");
  const row = await createTheme(store.id, { name, theme: data.theme, customCss: data.customCss ?? "", translations: data.translations ?? "{}", source: "zip" });
  await logActivity(`Thème « ${name} » importé depuis un fichier .zip`, `/admin/theme/${row.id}`);
  revalidatePath("/admin/theme");
  return back("ok", `« ${name} » ajouté à vos brouillons.`);
}
