import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { campaignEmail, unsubscribeUrl } from "@/lib/marketing";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { store } = await requirePerm("marketing");
  const c = await db.campaign.findFirst({ where: { id, storeId: store.id } });
  if (!c) return new Response("Introuvable", { status: 404 });
  const { html } = await campaignEmail(store, c, unsubscribeUrl(store.slug, "apercu"));
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "script-src 'none'" } });
}
