import { readFile } from "fs/promises";
import path from "path";

const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^[a-f0-9]{24}\.(jpg|png|webp|gif)$/.test(name)) return new Response("Introuvable", { status: 404 });
  try {
    const data = await readFile(path.join(process.cwd(), "uploads", name));
    return new Response(data, { headers: { "Content-Type": MIME[name.split(".")[1]], "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Introuvable", { status: 404 });
  }
}
