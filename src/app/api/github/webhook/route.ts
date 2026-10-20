import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pullTheme, validWebhookSignature } from "@/lib/github";
import { appConfig } from "@/lib/github-app";

type Payload = { action?: string; ref?: string; after?: string; repository?: { full_name?: string }; installation?: { id?: number }; repositories_removed?: { full_name?: string }[] };

/**
 * Webhooks GitHub : celui de l'application de la plateforme (tous les dépôts installés) ou celui d'un dépôt
 * relié par jeton. Un push sur une branche reliée met à jour le thème correspondant.
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

  // Application désinstallée : le compte est déconnecté ; les thèmes gardent leur dépôt mais ne se synchronisent plus.
  if (fromApp && event === "installation" && p.action === "deleted" && p.installation?.id) {
    const r = await db.store.updateMany({ where: { githubInstallationId: p.installation.id }, data: { githubInstallationId: null } });
    return NextResponse.json({ disconnected: r.count });
  }
  if (fromApp && event === "installation_repositories" && p.installation?.id && p.repositories_removed?.length) {
    const names = p.repositories_removed.map((r) => r.full_name).filter((n): n is string => Boolean(n));
    const r = await db.storeTheme.updateMany({ where: { store: { githubInstallationId: p.installation.id }, githubToken: null, githubRepo: { in: names } }, data: { githubError: "Le dépôt n'est plus accessible à l'application GitHub." } });
    return NextResponse.json({ flagged: r.count });
  }

  if (event !== "push") return NextResponse.json({ ignored: true });
  const repo = p.repository?.full_name;
  if (!repo || !p.ref?.startsWith("refs/heads/")) return NextResponse.json({ ignored: true });
  const branch = p.ref.slice("refs/heads/".length);
  const themes = await db.storeTheme.findMany({ where: { githubRepo: repo, githubBranch: branch }, include: { store: true } });
  let updated = 0;
  for (const theme of themes) {
    // Thème connecté par l'application : signature de l'application et même installation. Par jeton : son secret.
    const trusted = theme.githubToken
      ? Boolean(theme.githubWebhookSecret && validWebhookSignature(theme.githubWebhookSecret, body, signature))
      : fromApp && p.installation?.id === theme.store.githubInstallationId;
    if (!trusted) continue;
    if (p.after && p.after === theme.githubLastSha) continue; // commit envoyé par la boutique elle-même
    try { await pullTheme(theme, theme.store); updated++; } catch (e) {
      await db.storeTheme.update({ where: { id: theme.id }, data: { githubError: `Mise à jour depuis GitHub refusée : ${(e as Error).message}` } });
    }
  }
  return NextResponse.json({ updated });
}
