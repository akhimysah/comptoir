import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/auth";
import { zipSync } from "fflate";
import { db } from "@/lib/db";
import { buildThemeZip } from "@/lib/theme-zip";
import { ownTheme } from "@/lib/themes";
import { slugify } from "@/lib/utils";

/** Téléchargement d'un thème de la bibliothèque en .zip. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { store } = await requirePerm("content");
  const theme = await ownTheme(store.id, (await params).id);
  if (!theme) return new NextResponse("Introuvable", { status: 404 });
  // Thème Shopify : le .zip reprend tous ses fichiers, tel qu'il a été importé (avec les modifications faites ici).
  const bytes = theme.engine === "liquid"
    ? zipSync(Object.fromEntries((await db.themeFile.findMany({ where: { themeId: theme.id } })).map((f) => [f.path, f.text !== null ? new TextEncoder().encode(f.text) : new Uint8Array(f.bytes ?? [])])), { level: 6 })
    : buildThemeZip({ ...theme, name: store.name });
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${slugify(theme.name) || "theme"}-${new Date().toISOString().slice(0, 10)}.zip"`, "Cache-Control": "no-store" },
  });
}
