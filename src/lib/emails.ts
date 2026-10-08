import "server-only";
import type { Order, OrderItem, Store } from "@prisma/client";
import { formatMoney } from "./money";
import { appUrl } from "./stripe";
import { parseJson } from "./utils";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(storeName: string, title: string, body: string) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f1f1f1;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#303030">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;padding:32px" cellpadding="0" cellspacing="0"><tr><td>
<div style="font-size:18px;font-weight:700;margin-bottom:24px">${esc(storeName)}</div>
<h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
${body}
</td></tr></table>
<p style="font-size:12px;color:#8a8a8a;margin-top:16px">Envoyé par ${esc(storeName)} via Comptoir</p>
</td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<a href="${esc(href)}" style="display:inline-block;background:#303030;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">${esc(label)}</a>`;

function itemsTable(order: Order & { items: OrderItem[] }, currency: string) {
  const m = (c: number) => formatMoney(c, currency);
  const rows = order.items
    .map((i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #ebebeb">${esc(i.productTitle)}${i.variantTitle !== "Par défaut" ? ` <span style="color:#616161">· ${esc(i.variantTitle)}</span>` : ""} × ${i.quantity}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #ebebeb">${m(i.priceCents * i.quantity)}</td></tr>`)
    .join("");
  const line = (k: string, v: string, bold = false) => `<tr><td style="padding:4px 0;${bold ? "font-weight:700" : "color:#616161"}">${k}</td><td align="right" style="padding:4px 0;${bold ? "font-weight:700" : ""}">${v}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:16px 0">${rows}
${line("Sous-total", m(order.subtotalCents))}${order.discountCents ? line(`Remise ${esc(order.discountCode ?? "")}`, `−${m(order.discountCents)}`) : ""}${line("Livraison", order.shippingCents ? m(order.shippingCents) : "Offerte")}${line("Total", m(order.totalCents), true)}</table>`;
}

function addressBlock(order: Order) {
  const a = parseJson<{ line1: string; zip: string; city: string; country: string }>(order.address, { line1: "", zip: "", city: "", country: "" });
  return `<p style="font-size:14px;line-height:1.5;color:#616161;margin:0"><b style="color:#303030">Adresse de livraison</b><br>${esc(order.name)}<br>${esc(a.line1)}<br>${esc(a.zip)} ${esc(a.city)}<br>${esc(a.country)}</p>`;
}

export function orderConfirmationEmail(store: Store, order: Order & { items: OrderItem[] }) {
  return {
    subject: `Commande #${order.number} confirmée`,
    html: layout(store.name, `Merci pour votre commande, ${order.name.split(" ")[0]} !`,
      `<p style="font-size:14px;line-height:1.5">Nous préparons votre commande <b>#${order.number}</b>. Vous recevrez un autre e-mail dès qu'elle sera expédiée.</p>
${itemsTable(order, store.currency)}${addressBlock(order)}
<p style="margin-top:24px">${button(`${appUrl()}/s/${store.slug}`, "Retourner sur la boutique")}</p>`),
  };
}

export function shippingEmail(store: Store, order: Order & { items: OrderItem[] }) {
  return {
    subject: `Votre commande #${order.number} est en route`,
    html: layout(store.name, "Votre commande a été expédiée",
      `<p style="font-size:14px;line-height:1.5">Bonne nouvelle : votre commande <b>#${order.number}</b> a quitté nos mains et arrive bientôt.</p>${itemsTable(order, store.currency)}${addressBlock(order)}`),
  };
}

export function newOrderAlertEmail(store: Store, order: Order & { items: OrderItem[] }) {
  return {
    subject: `[${store.name}] Nouvelle commande #${order.number} de ${order.name}`,
    html: layout(store.name, `Nouvelle commande : ${formatMoney(order.totalCents, store.currency)}`,
      `<p style="font-size:14px;line-height:1.5">${esc(order.name)} (${esc(order.email)}) vient de passer la commande <b>#${order.number}</b>.</p>${itemsTable(order, store.currency)}
<p>${button(`${appUrl()}/admin/orders/${order.id}`, "Voir la commande")}</p>`),
  };
}

export function passwordResetEmail(link: string) {
  return {
    subject: "Réinitialiser votre mot de passe Comptoir",
    html: layout("Comptoir", "Réinitialiser votre mot de passe",
      `<p style="font-size:14px;line-height:1.5">Quelqu'un a demandé à réinitialiser le mot de passe de ce compte. Si c'est vous, cliquez sur le bouton ci-dessous. Le lien est valable 1 heure.</p>
<p>${button(link, "Choisir un nouveau mot de passe")}</p>
<p style="font-size:13px;color:#616161">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : votre mot de passe ne change pas.</p>`),
  };
}

export function inviteEmail(storeName: string, invitedBy: string, link: string) {
  return {
    subject: `${invitedBy} vous invite à gérer ${storeName}`,
    html: layout(storeName, `Rejoindre ${storeName}`,
      `<p style="font-size:14px;line-height:1.5">${esc(invitedBy)} vous invite à gérer la boutique <b>${esc(storeName)}</b> sur Comptoir. Le lien est valable 7 jours.</p><p>${button(link, "Accepter l'invitation")}</p>`),
  };
}
