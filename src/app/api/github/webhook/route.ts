import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pullTheme, validWebhookSignature } from "@/lib/github";

/** Push sur la branche reliée d'un dépôt GitHub : le thème de la boutique est mis à jour. */
export async function POST(req: Request) {
  const body = await req.text();
  if (req.headers.get("x-github-event") === "ping") return NextResponse.json({ ok: true });
  if (req.headers.get("x-github-event") !== "push") return NextResponse.json({ ignored: true });
  let payload: { ref?: string; after?: string; repository?: { full_name?: string } };
  try { payload = JSON.parse(body); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const repo = payload.repository?.full_name;
  if (!repo || !payload.ref?.startsWith("refs/heads/")) return NextResponse.json({ ignored: true });
  const branch = payload.ref.slice("refs/heads/".length);
  const stores = await db.store.findMany({ where: { githubRepo: repo, githubBranch: branch } });
  let updated = 0;
  for (const store of stores) {
    // Chaque boutique a son secret : la signature prouve que l'envoi vient bien de son webhook.
    if (!store.githubWebhookSecret || !validWebhookSignature(store.githubWebhookSecret, body, req.headers.get("x-hub-signature-256"))) continue;
    if (payload.after && payload.after === store.githubLastSha) continue; // commit envoyé par la boutique elle-même
    try { await pullTheme(store); updated++; } catch (e) {
      await db.store.update({ where: { id: store.id }, data: { githubError: `Mise à jour depuis GitHub refusée : ${(e as Error).message}` } });
    }
  }
  return NextResponse.json({ updated });
}
