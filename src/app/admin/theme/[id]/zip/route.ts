import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/auth";
import { buildThemeZip } from "@/lib/theme-zip";
import { ownTheme } from "@/lib/themes";
import { slugify } from "@/lib/utils";

/** Téléchargement d'un thème de la bibliothèque en .zip. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { store } = await requirePerm("content");
  const theme = await ownTheme(store.id, (await params).id);
  if (!theme) return new NextResponse("Introuvable", { status: 404 });
  return new NextResponse(Buffer.from(buildThemeZip({ ...theme, name: store.name })), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${slugify(theme.name) || "theme"}-${new Date().toISOString().slice(0, 10)}.zip"`, "Cache-Control": "no-store" },
  });
}
