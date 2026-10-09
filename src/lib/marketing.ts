import "server-only";
import { randomBytes } from "crypto";
import type { Campaign, Store } from "@prisma/client";
import { db } from "./db";
import { markdownToEmailHtml } from "./email-markdown";
import { formatMoney } from "./money";
import { appUrl } from "./stripe";
import { parseJson } from "./utils";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Inscrit (ou réinscrit) une adresse à la newsletter de la boutique. */
export async function subscribe(storeId: string, emailRaw: string, name = "") {
  const email = emailRaw.trim().toLowerCase();
  const existing = await db.customer.findUnique({ where: { storeId_email: { storeId, email } } });
  const token = existing?.marketingToken ?? randomBytes(18).toString("base64url");
  return db.customer.upsert({
    where: { storeId_email: { storeId, email } },
    update: { acceptsMarketing: true, marketingToken: token, subscribedAt: existing?.acceptsMarketing ? existing.subscribedAt : new Date() },
    create: { storeId, email, name: name || email.split("@")[0], acceptsMarketing: true, marketingToken: token, subscribedAt: new Date() },
  });
}

/** E-mail d'une campagne. Le lien de désabonnement est obligatoire (RGPD). */
export async function campaignEmail(store: Store, c: Campaign, unsubscribeUrl: string) {
  const ids = parseJson<string[]>(c.productIds, []);
  const products = ids.length ? await db.product.findMany({ where: { id: { in: ids }, storeId: store.id, status: "active" }, include: { variants: true } }) : [];
  const base = appUrl();
  const cards = products.map((p) => {
    const img = parseJson<string[]>(p.images, [])[0];
    const price = Math.min(...p.variants.map((v) => v.priceCents));
    const visual = img
      ? `<img src="${esc(img.startsWith("http") ? img : base + img)}" alt="" width="250" style="width:100%;border-radius:10px;display:block">`
      : `<div style="height:150px;border-radius:10px;background:linear-gradient(140deg,hsl(${p.hue} 42% 80%),hsl(${p.hue + 30} 44% 58%))"></div>`;
    return `<td width="50%" valign="top" style="padding:8px"><a href="${base}/s/${store.slug}/p/${p.handle}" style="color:#303030;text-decoration:none">${visual}<div style="font-weight:600;margin-top:8px;font-size:14px">${esc(p.title)}</div><div style="font-size:14px;color:#616161">${formatMoney(price, store.currency)}</div></a></td>`;
  });
  const rows: string[] = [];
  for (let i = 0; i < cards.length; i += 2) rows.push(`<tr>${cards[i]}${cards[i + 1] ?? '<td width="50%"></td>'}</tr>`);
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f1f1f1;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#303030">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:580px;background:#fff;border-radius:14px;padding:32px" cellpadding="0" cellspacing="0"><tr><td>
<div style="font-size:18px;font-weight:700;margin-bottom:22px">${esc(store.name)}</div>
${c.title ? `<h1 style="font-size:26px;line-height:1.2;margin:0 0 16px">${esc(c.title)}</h1>` : ""}
${markdownToEmailHtml(c.body)}
${rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px -8px 6px">${rows.join("")}</table>` : ""}
<p style="margin:22px 0 0"><a href="${base}/s/${store.slug}" style="display:inline-block;background:#303030;color:#fff;text-decoration:none;padding:12px 22px;border-radius:9px;font-weight:600;font-size:15px">${esc(c.buttonText || "Découvrir")}</a></p>
</td></tr></table>
<p style="font-size:12px;color:#8a8a8a;margin-top:16px;line-height:1.6">Vous recevez cet e-mail car vous êtes inscrit à la newsletter de ${esc(store.name)}.<br><a href="${unsubscribeUrl}" style="color:#8a8a8a">Se désabonner</a></p>
</td></tr></table></body></html>`;
  return { subject: c.subject, html };
}

export const unsubscribeUrl = (slug: string, token: string) => `${appUrl()}/s/${slug}/unsubscribe?t=${token}`;

/**
 * Destinataires d'une campagne : les abonnés à la newsletter, limités au segment choisi.
 * null si le segment n'existe plus (on n'envoie pas à tout le monde par erreur).
 */
export async function campaignRecipients(storeId: string, segmentId: string | null) {
  const subscribers = await db.customer.findMany({ where: { storeId, acceptsMarketing: true, marketingToken: { not: null } } });
  if (!segmentId) return subscribers;
  const { segmentMembers } = await import("./segments");
  const members = await segmentMembers(storeId, segmentId);
  if (!members) return null;
  const ids = new Set(members.map((m) => m.id));
  return subscribers.filter((s) => ids.has(s.id));
}
