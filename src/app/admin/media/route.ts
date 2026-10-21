import { NextResponse } from "next/server";
import { requireStore } from "@/lib/auth";
import { db } from "@/lib/db";

/** Bibliothèque de fichiers de la boutique (Contenu › Fichiers) pour le sélecteur d'images : ?q=<recherche>. */
export async function GET(req: Request) {
  const { store } = await requireStore();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  const files = await db.mediaFile.findMany({
    where: { storeId: store.id, mime: { startsWith: "image/" }, ...(q ? { OR: [{ name: { contains: q } }, { alt: { contains: q } }] } : {}) },
    orderBy: { createdAt: "desc" }, take: 120, select: { id: true, url: true, name: true, alt: true, width: true, height: true, size: true },
  });
  return NextResponse.json({ files }, { headers: { "Cache-Control": "private, no-store" } });
}
