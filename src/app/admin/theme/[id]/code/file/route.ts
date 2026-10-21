import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/auth";
import { isTextPath, themeFile, themePath } from "@/lib/liquid/source";
import { ownTheme } from "@/lib/themes";

/** Contenu d'un fichier texte d'un thème Shopify, pour « Modifier le code ». */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { store } = await requirePerm("content");
  const theme = await ownTheme(store.id, (await params).id);
  const path = themePath(new URL(req.url).searchParams.get("path") ?? "");
  if (!theme || !path || !isTextPath(path)) return new NextResponse("Introuvable", { status: 404 });
  const file = await themeFile(theme.id, path);
  if (!file) return new NextResponse("Introuvable", { status: 404 });
  return new NextResponse(file.text ?? Buffer.from(file.bytes ?? []).toString("utf8"), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
