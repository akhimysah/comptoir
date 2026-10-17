import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pullTheme, validWebhookSignature } from "@/lib/github";
import { appConfig } from "@/lib/github-app";

type Payload = {
  action?: string;
  ref?: string;
  after?: string;
  repository?: { full_name?: string };
  installation?: { id?: number };
  repositories_removed?: { full_name?: string }[];
};

/**
 * Webhooks GitHub : celui de l'application de la plateforme (tous les dépôts installés) ou celui d'un dépôt
 * relié par jeton. Un push sur la branche reliée met à jour le thème de la boutique.
 */
export async function POST(req: Request) {
  const body = await req.text();
  const event = req.headers.get("x-github-event");
  const signature = req.headers.get("x-hub-signature-256");
  if (event === "ping") return NextResponse.json({ ok: true });
  let p: Payload;
  try { p = JSON.parse(body); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const app = await appConfig();
  const fromApp = Boolean(app?.webhookSecret && validWebhookSignature(app.webhookSecret, body, signature));

  // Application désinstallée, ou dépôt retiré de l'installation : les boutiques concernées sont déliées.
  if (fromApp && event === "installation" && p.action === "deleted" && p.installation?.id) {
    const r = await db.store.updateMany({ where: { githubInstallationId: p.installation.id }, data: { githubInstallationId: null, githubRepo: null, githubLastSha: null, githubError: "" } });
    return NextResponse.json({ unlinked: r.count });
  }
  if (fromApp && event === "installation_repositories" && p.installation?.id && p.repositories_removed?.length) {
    const names = p.repositories_removed.map((r) => r.full_name).filter((n): n is string => Boolean(n));
    const r = await db.store.updateMany({ where: { githubInstallationId: p.installation.id, githubRepo: { in: names } }, data: { githubRepo: null, githubLastSha: null, githubError: "" } });
    return NextResponse.json({ unlinked: r.count });
  }

  if (event !== "push") return NextResponse.json({ ignored: true });
  const repo = p.repository?.full_name;
  if (!repo || !p.ref?.startsWith("refs/heads/")) return NextResponse.json({ ignored: true });
  const branch = p.ref.slice("refs/heads/".length);
  const stores = await db.store.findMany({ where: { githubRepo: repo, githubBranch: branch } });
  let updated = 0;
  for (const store of stores) {
    // Boutique connectée par l'application : signature de l'application et même installation. Par jeton : son secret.
    const trusted = store.githubInstallationId
      ? fromApp && p.installation?.id === store.githubInstallationId
      : Boolean(store.githubWebhookSecret && validWebhookSignature(store.githubWebhookSecret, body, signature));
    if (!trusted) continue;
    if (p.after && p.after === store.githubLastSha) continue; // commit envoyé par la boutique elle-même
    try { await pullTheme(store); updated++; } catch (e) {
      await db.store.update({ where: { id: store.id }, data: { githubError: `Mise à jour depuis GitHub refusée : ${(e as Error).message}` } });
    }
  }
  return NextResponse.json({ updated });
}
