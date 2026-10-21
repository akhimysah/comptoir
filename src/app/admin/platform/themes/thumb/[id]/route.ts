import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Capture d'écran d'un thème de la bibliothèque de la plateforme (galerie « Découvrir des thèmes »). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const file = await db.platformThemeFile.findUnique({ where: { themeId_path: { themeId: (await params).id, path: "thumbnail.png" } } });
  if (!file?.bytes) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(file.bytes), { headers: { "Content-Type": file.contentType || "image/png", "Cache-Control": "private, max-age=3600" } });
}
