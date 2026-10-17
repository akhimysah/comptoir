import "server-only";
import type { Order, OrderItem, Store } from "@prisma/client";
import { formatMoney } from "./money";
import { orderCurrency } from "./presentment";
import { appUrl } from "./stripe";
import { parseJson } from "./utils";
import { carrierLabel, trackingLink } from "./tracking";
import { fill, templateText, type TemplateKey } from "./email-templates";
import { readTheme } from "./theme";
import { storeBase } from "./domains";
import { dict, intlLocale, isLocale, type Locale } from "./i18n";

/** Langue d'une commande (celle du client au moment de l'achat). */
export const orderLocale = (o: { locale?: string | null }): Locale => (isLocale(o.locale) ? o.locale : "fr");

/** Textes communs des e-mails clients, dans la langue du client. Les e-mails au marchand restent en français. */
const T = dict(
  {
    sentBy: (s: string) => `Envoyé par ${s} via Revolution Ecom`,
    subtotal: "Sous-total",
    discount: "Remise",
    shipping: "Livraison",
    free: "Offerte",
    giftCard: "Carte cadeau",
    totalPaid: "Total payé",
    pickup: "Retrait en boutique",
    shippingAddress: "Adresse de livraison",
    dueBy: (amount: string, date: string) => `${amount} à régler avant le ${date}`,
    payOnline: "Payer en ligne",
    backToStore: "Retourner sur la boutique",
    carrier: "Transporteur",
    trackingNumber: "numéro de suivi",
    trackParcel: "Suivre mon colis",
    trackingSubject: (n: number) => `Suivi de votre commande #${n} mis à jour`,
    trackingTitle: "Nouveau suivi pour votre colis",
    trackingBody: (n: number) => `Les informations de suivi de votre commande <b>#${n}</b> ont changé.`,
    resumeOrder: "Reprendre ma commande",
    giftSubject: (store: string, amount: string) => `Votre carte cadeau ${store} de ${amount}`,
    giftTitle: (amount: string) => `Vous avez reçu une carte cadeau de ${amount}`,
    giftCode: "Code de la carte",
    validUntil: (date: string) => `Valable jusqu'au ${date}`,
    giftHowTo: "Saisissez ce code dans votre panier, champ « Carte cadeau ». Le montant non utilisé reste sur la carte.",
    discoverStore: "Découvrir la boutique",
    reason: "Motif",
    loginSubject: (code: string, store: string) => `${code} est votre code de connexion ${store}`,
    loginTitle: "Votre code de connexion",
    loginBody: "Saisissez ce code pour accéder à votre compte. Il est valable 15 minutes.",
    loginIgnore: "Si vous n'avez rien demandé, ignorez cet e-mail.",
    reviewHowTo: "Il suffit de cliquer sur un produit puis sur « Écrire un avis ».",
    returnSubject: (n: number) => `Votre demande de retour pour la commande #${n}`,
    returnReceivedTitle: "Nous avons bien reçu votre demande de retour",
    returnReceivedBody: (n: number) => `Votre demande pour la commande <b>#${n}</b> est enregistrée. Nous l'examinons et revenons vers vous avec les instructions de retour. <b>N'envoyez rien avant notre réponse.</b>`,
    returnHow: "Comment nous les renvoyer",
    returnMention: (n: number) => `Indiquez le numéro de commande <b>#${n}</b> dans le colis.`,
    returnDeclinedTitle: "Nous ne pouvons pas accepter ce retour",
    returnDeclinedBody: (n: number) => `Après examen, nous ne pouvons pas accepter le retour de la commande <b>#${n}</b>.`,
    replyQuestion: "Une question ? Répondez simplement à cet e-mail.",
    pay: (amount: string) => `Payer ${amount}`,
    copyLink: "Ou copiez ce lien :",
    backSubject: (name: string, store: string) => `${name} est de retour chez ${store}`,
    backTitle: "C'est de nouveau disponible !",
    backBody: (name: string, price: string) => `Bonne nouvelle : <b>${name}</b> est de retour en stock, à ${price}. Les quantités sont limitées, ne tardez pas.`,
    backCta: "Je le veux",
    backFooter: "Vous recevez cet e-mail car vous avez demandé à être prévenu. Nous ne vous écrirons pas à nouveau pour cet article.",
    chatSubject: (store: string) => `Réponse de ${store} à votre message`,
    chatHello: (name: string) => `Bonjour ${name},`,
    chatContinue: "Continuer la conversation",
  },
  {
    sentBy: (s: string) => `Sent by ${s} via Revolution Ecom`,
    subtotal: "Subtotal",
    discount: "Discount",
    shipping: "Shipping",
    free: "Free",
    giftCard: "Gift card",
    totalPaid: "Total paid",
    pickup: "In-store pickup",
    shippingAddress: "Shipping address",
    dueBy: (amount: string, date: string) => `${amount} due by ${date}`,
    payOnline: "Pay online",
    backToStore: "Visit our store",
    carrier: "Carrier",
    trackingNumber: "tracking number",
    trackParcel: "Track my package",
    trackingSubject: (n: number) => `Tracking for your order #${n} has been updated`,
    trackingTitle: "New tracking for your package",
    trackingBody: (n: number) => `The tracking information for your order <b>#${n}</b> has changed.`,
    resumeOrder: "Complete my order",
    giftSubject: (store: string, amount: string) => `Your ${amount} ${store} gift card`,
    giftTitle: (amount: string) => `You've received a ${amount} gift card`,
    giftCode: "Gift card code",
    validUntil: (date: string) => `Valid until ${date}`,
    giftHowTo: "Enter this code in your cart, in the “Gift card” field. Any unused balance stays on the card.",
    discoverStore: "Visit the store",
    reason: "Reason",
    loginSubject: (code: string, store: string) => `${code} is your ${store} login code`,
    loginTitle: "Your login code",
    loginBody: "Enter this code to access your account. It's valid for 15 minutes.",
    loginIgnore: "If you didn't request this, you can ignore this email.",
    reviewHowTo: "Just click a product, then “Write a review”.",
    returnSubject: (n: number) => `Your return request for order #${n}`,
    returnReceivedTitle: "We've received your return request",
    returnReceivedBody: (n: number) => `Your request for order <b>#${n}</b> has been received. We'll review it and get back to you with return instructions. <b>Please don't send anything until you hear from us.</b>`,
    returnHow: "How to send them back",
    returnMention: (n: number) => `Include order number <b>#${n}</b> in the package.`,
    returnDeclinedTitle: "We can't accept this return",
    returnDeclinedBody: (n: number) => `After review, we're unable to accept the return for order <b>#${n}</b>.`,
    replyQuestion: "Any questions? Just reply to this email.",
    pay: (amount: string) => `Pay ${amount}`,
    copyLink: "Or copy this link:",
    backSubject: (name: string, store: string) => `${name} is back in stock at ${store}`,
    backTitle: "It's back in stock!",
    backBody: (name: string, price: string) => `Good news: <b>${name}</b> is back in stock, at ${price}. Quantities are limited, so don't wait.`,
    backCta: "Shop now",
    backFooter: "You're receiving this email because you asked to be notified. We won't email you about this item again.",
    chatSubject: (store: string) => `Reply from ${store} to your message`,
    chatHello: (name: string) => `Hi ${name},`,
    chatContinue: "Continue the conversation",
  },
);

const money = (cents: number, currency: string, locale: Locale) => formatMoney(cents, currency, intlLocale(locale));

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(storeName: string, title: string, body: string, accent = "#303030", locale: Locale = "fr") {
  return `<!doctype html><html lang="${locale}"><body style="margin:0;background:#f1f1f1;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#303030">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;padding:32px;border-top:4px solid ${accent}" cellpadding="0" cellspacing="0"><tr><td>
<div style="font-size:18px;font-weight:700;margin-bottom:24px;color:${accent}">${esc(storeName)}</div>
<h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
${body}
</td></tr></table>
<p style="font-size:12px;color:#8a8a8a;margin-top:16px">${T[locale].sentBy(esc(storeName))}</p>
</td></tr></table></body></html>`;
}

const button = (href: string, label: string, bg = "#303030", fg = "#fff") =>
  `<a href="${esc(href)}" style="display:inline-block;background:${bg};color:${fg};text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">${esc(label)}</a>`;

/** Couleurs de la boutique (thème) et textes personnalisés d'un e-mail client. */
function brand(store: Store) {
  const c = readTheme(store.theme, store.name).colors;
  const safe = (x: string, d: string) => (/^#[0-9a-fA-F]{3,8}$/.test(x) ? x : d);
  return { accent: safe(c.accent, "#303030"), accentText: safe(c.accentText, "#ffffff") };
}

function texts(store: Store, key: TemplateKey, vars: Record<string, string>, locale: Locale = "fr") {
  // En anglais, les textes d'origine anglais : la personnalisation du marchand est rédigée en français.
  const t = templateText(store.emailTemplates, key, locale);
  const v = { boutique: store.name, ...vars };
  const b = brand(store);
  return {
    subject: fill(t.subject, v),
    title: fill(t.title, v),
    intro: fill(t.intro, v).split(/\n{2,}/).map((para) => `<p style="font-size:14px;line-height:1.5">${esc(para).replace(/\n/g, "<br>")}</p>`).join(""),
    layout: (title: string, body: string) => layout(store.name, title, body, b.accent, locale),
    button: (href: string, label: string) => button(href, label, b.accent, b.accentText),
  };
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

function itemsTable(order: Order & { items: OrderItem[] }, currency: string, locale: Locale = "fr") {
  // Montants dans la devise payée par le client (conversion au taux de la commande).
  const cur = orderCurrency(order, currency);
  const m = (c: number) => money(cur.convert(c), cur.currency, locale);
  const L = T[locale];
  const rows = order.items
    .map((i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #ebebeb">${esc(i.productTitle)}${i.variantTitle !== "Par défaut" ? ` <span style="color:#616161">· ${esc(i.variantTitle)}</span>` : ""} × ${i.quantity}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #ebebeb">${m(i.priceCents * i.quantity)}</td></tr>`)
    .join("");
  const line = (k: string, v: string, bold = false) => `<tr><td style="padding:4px 0;${bold ? "font-weight:700" : "color:#616161"}">${k}</td><td align="right" style="padding:4px 0;${bold ? "font-weight:700" : ""}">${v}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:16px 0">${rows}
${line(L.subtotal, m(order.subtotalCents))}${order.discountCents ? line(`${L.discount} ${esc(order.discountCode ?? "")}`, `−${m(order.discountCents)}`) : ""}${line(L.shipping, order.shippingCents ? m(order.shippingCents) : L.free)}${order.giftCardCents ? line(`${L.giftCard} ····${esc((order.giftCardCode ?? "").slice(-4))}`, `−${m(order.giftCardCents)}`) : ""}${line(L.totalPaid, money(cur.total, cur.currency, locale), true)}</table>`;
}

function addressBlock(order: Order, store?: Store, locale: Locale = "fr") {
  if (order.deliveryMethod === "pickup") {
    return `<p style="font-size:14px;line-height:1.5;color:#616161;margin:0"><b style="color:#303030">${T[locale].pickup}</b><br>${esc(store?.pickupAddress ?? "").replace(/\n/g, "<br>")}${store?.pickupInstructions ? `<br><span style="font-size:13px">${esc(store.pickupInstructions).replace(/\n/g, "<br>")}</span>` : ""}</p>`;
  }
  const a = parseJson<{ line1: string; zip: string; city: string; country: string }>(order.address, { line1: "", zip: "", city: "", country: "" });
  return `<p style="font-size:14px;line-height:1.5;color:#616161;margin:0"><b style="color:#303030">${T[locale].shippingAddress}</b><br>${esc(order.name)}<br>${esc(a.line1)}<br>${esc(a.zip)} ${esc(a.city)}<br>${esc(a.country)}</p>`;
}

export function orderConfirmationEmail(store: Store, order: Order & { items: OrderItem[] }, payUrl?: string | null, locale: Locale = orderLocale(order)) {
  const L = T[locale];
  const cur = orderCurrency(order, store.currency);
  const t = texts(store, "order_confirmation", { prenom: firstName(order.name), numero: String(order.number), montant: money(cur.total, cur.currency, locale) }, locale);
  // Client professionnel à échéance : montant et date limite, avec le lien pour payer en ligne.
  const due = order.dueAt && order.paymentStatus === "pending"
    ? `<div style="margin:16px 0;background:#f7f7f7;border-radius:8px;padding:12px 14px;font-size:14px;line-height:1.5"><b>${L.dueBy(money(order.totalCents, store.currency, locale), order.dueAt.toLocaleDateString(intlLocale(locale), { day: "numeric", month: "long", year: "numeric" }))}</b>${payUrl ? `<div style="margin-top:10px">${t.button(payUrl, L.payOnline)}</div>` : ""}</div>`
    : "";
  return {
    subject: t.subject,
    html: t.layout(t.title, `${t.intro}${due}
${itemsTable(order, store.currency, locale)}${addressBlock(order, store, locale)}
<p style="margin-top:24px">${t.button(`${storeBase(store)}`, L.backToStore)}</p>`),
  };
}

export function shippingEmail(store: Store, order: Order & { items: OrderItem[] }, update = false, locale: Locale = orderLocale(order)) {
  const L = T[locale];
  const t = texts(store, "shipping", { prenom: firstName(order.name), numero: String(order.number) }, locale);
  const link = trackingLink(order);
  const tracking = order.trackingNumber
    ? `<div style="margin:16px 0;background:#f7f7f7;border-radius:8px;padding:12px 14px;font-size:14px;line-height:1.5"><b>${esc(carrierLabel(order.trackingCarrier) || L.carrier)}</b> · ${L.trackingNumber} <span style="font-family:monospace">${esc(order.trackingNumber)}</span>${link ? `<div style="margin-top:10px">${t.button(link, L.trackParcel)}</div>` : ""}</div>`
    : "";
  return {
    subject: update ? L.trackingSubject(order.number) : t.subject,
    html: t.layout(update ? L.trackingTitle : t.title,
      `${update ? `<p style="font-size:14px;line-height:1.5">${L.trackingBody(order.number)}</p>` : t.intro}${tracking}${itemsTable(order, store.currency, locale)}${addressBlock(order, store, locale)}`),
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
    subject: "Réinitialiser votre mot de passe Revolution Ecom",
    html: layout("Revolution Ecom", "Réinitialiser votre mot de passe",
      `<p style="font-size:14px;line-height:1.5">Quelqu'un a demandé à réinitialiser le mot de passe de ce compte. Si c'est vous, cliquez sur le bouton ci-dessous. Le lien est valable 1 heure.</p>
<p>${button(link, "Choisir un nouveau mot de passe")}</p>
<p style="font-size:13px;color:#616161">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : votre mot de passe ne change pas.</p>`),
  };
}

export function inviteEmail(storeName: string, invitedBy: string, link: string) {
  return {
    subject: `${invitedBy} vous invite à gérer ${storeName}`,
    html: layout(storeName, `Rejoindre ${storeName}`,
      `<p style="font-size:14px;line-height:1.5">${esc(invitedBy)} vous invite à gérer la boutique <b>${esc(storeName)}</b> sur Revolution Ecom. Le lien est valable 7 jours.</p><p>${button(link, "Accepter l'invitation")}</p>`),
  };
}

export function abandonedCartEmail(store: Store, name: string, lines: { title: string; quantity: number; priceCents: number }[], link: string, locale: Locale = "fr") {
  const m = (c: number) => money(c, store.currency, locale);
  const t = texts(store, "abandoned_cart", { prenom: firstName(name) }, locale);
  const rows = lines.map((l) => `<tr><td style="padding:8px 0;border-bottom:1px solid #ebebeb">${esc(l.title)} × ${l.quantity}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #ebebeb">${m(l.priceCents * l.quantity)}</td></tr>`).join("");
  return {
    subject: t.subject,
    html: t.layout(t.title, `${t.intro}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:16px 0">${rows}</table>
<p>${t.button(link, T[locale].resumeOrder)}</p>`),
  };
}

export function giftCardEmail(store: Store, code: string, amountCents: number, note: string, expiresAt: Date | null, locale: Locale = "fr") {
  const L = T[locale];
  const pretty = code.match(/.{1,4}/g)?.join(" ") ?? code;
  const amount = money(amountCents, store.currency, locale);
  return {
    subject: L.giftSubject(store.name, amount),
    html: layout(store.name, L.giftTitle(amount),
      `${note ? `<p style="font-size:14px;line-height:1.5;font-style:italic">${locale === "en" ? `“${esc(note)}”` : `« ${esc(note)} »`}</p>` : ""}
<div style="margin:20px 0;padding:18px;border:2px dashed #b5b5b5;border-radius:12px;text-align:center">
<div style="font-size:12px;color:#616161;text-transform:uppercase;letter-spacing:.08em">${L.giftCode}</div>
<div style="font-size:22px;font-weight:700;letter-spacing:.12em;font-family:monospace;margin-top:6px">${pretty}</div>
${expiresAt ? `<div style="font-size:12px;color:#616161;margin-top:6px">${L.validUntil(expiresAt.toLocaleDateString(intlLocale(locale)))}</div>` : ""}
</div>
<p style="font-size:14px;line-height:1.5">${esc(L.giftHowTo)}</p>
<p>${button(`${storeBase(store)}`, L.discoverStore)}</p>`, undefined, locale),
  };
}

export function refundEmail(store: Store, number: number, amountCents: number, items: { title: string; quantity: number }[], reason: string, locale: Locale = "fr", currency = store.currency) {
  const t = texts(store, "refund", { numero: String(number), montant: money(amountCents, currency, locale) }, locale);
  return {
    subject: t.subject,
    html: t.layout(t.title, `${t.intro}
${items.length ? `<ul style="font-size:14px;line-height:1.6;color:#616161">${items.map((i) => `<li>${esc(i.title)} × ${i.quantity}</li>`).join("")}</ul>` : ""}
${reason ? `<p style="font-size:13px;color:#616161">${T[locale].reason}${locale === "en" ? ":" : " :"} ${esc(reason)}</p>` : ""}`),
  };
}

export function loginCodeEmail(store: Store, code: string, locale: Locale = "fr") {
  const L = T[locale];
  return {
    subject: L.loginSubject(code, store.name),
    html: layout(store.name, L.loginTitle,
      `<p style="font-size:14px;line-height:1.5">${esc(L.loginBody)}</p>
<div style="margin:20px 0;font-size:32px;font-weight:700;letter-spacing:.3em;font-family:monospace;text-align:center">${code}</div>
<p style="font-size:13px;color:#616161">${esc(L.loginIgnore)}</p>`, undefined, locale),
  };
}

export function lowStockEmail(store: Store, items: { title: string; stock: number }[]) {
  return {
    subject: `[${store.name}] Stock faible : ${items.map((i) => i.title).join(", ").slice(0, 80)}`,
    html: layout(store.name, "Stock faible",
      `<p style="font-size:14px;line-height:1.5">Ces articles passent sous votre seuil d'alerte (${store.lowStockThreshold}) :</p>
<ul style="font-size:14px;line-height:1.7">${items.map((i) => `<li><b>${esc(i.title)}</b> : ${i.stock <= 0 ? (i.stock < 0 ? `${-i.stock} en précommande à réapprovisionner` : "rupture de stock") : `${i.stock} restant${i.stock > 1 ? "s" : ""}`}</li>`).join("")}</ul>
<p>${button(`${appUrl()}/admin/inventory?filter=low`, "Gérer le stock")}</p>`),
  };
}

export function reviewRequestEmail(store: Store, name: string, products: { title: string; url: string }[], locale: Locale = "fr") {
  const t = texts(store, "review_request", { prenom: firstName(name) }, locale);
  return {
    subject: t.subject,
    html: t.layout(t.title, `${t.intro}
${products.map((p) => `<p style="margin:10px 0"><a href="${esc(p.url)}" style="display:block;border:1px solid #e3e3e3;border-radius:10px;padding:12px 14px;color:#303030;text-decoration:none"><b>${esc(p.title)}</b><span style="float:right;color:#e3a008;letter-spacing:2px">★★★★★</span></a></p>`).join("")}
<p style="font-size:13px;color:#616161">${esc(T[locale].reviewHowTo)}</p>`),
  };
}

type ReturnItem = { title: string; quantity: number; reason: string };
const returnList = (items: ReturnItem[]) =>
  `<ul style="font-size:14px;line-height:1.6;color:#616161">${items.map((i) => `<li>${esc(i.title)} × ${i.quantity} <span style="color:#8a8a8a">· ${esc(i.reason)}</span></li>`).join("")}</ul>`;

export function returnRequestedEmail(store: Store, number: number, items: ReturnItem[], locale: Locale = "fr") {
  const L = T[locale];
  return {
    subject: L.returnSubject(number),
    html: layout(store.name, L.returnReceivedTitle,
      `<p style="font-size:14px;line-height:1.5">${L.returnReceivedBody(number)}</p>${returnList(items)}`, undefined, locale),
  };
}

export function returnRequestedAlertEmail(store: Store, order: Order, items: ReturnItem[], note: string) {
  return {
    subject: `[${store.name}] Demande de retour sur la commande #${order.number}`,
    html: layout(store.name, "Nouvelle demande de retour",
      `<p style="font-size:14px;line-height:1.5">${esc(order.name)} (${esc(order.email)}) souhaite retourner des articles de la commande <b>#${order.number}</b>.</p>${returnList(items)}
${note ? `<p style="font-size:14px;line-height:1.5;color:#616161">« ${esc(note)} »</p>` : ""}
<p>${button(`${appUrl()}/admin/orders/${order.id}`, "Accepter ou refuser")}</p>`),
  };
}

export function returnApprovedEmail(store: Store, number: number, items: ReturnItem[], locale: Locale = "fr") {
  const L = T[locale];
  const t = texts(store, "return_approved", { numero: String(number) }, locale);
  const instructions = store.returnInstructions.trim();
  return {
    subject: t.subject,
    html: t.layout(t.title, `${t.intro}${returnList(items)}
${instructions ? `<div style="font-size:14px;line-height:1.5;background:#f7f7f7;border-radius:8px;padding:12px 14px;white-space:pre-line"><b>${L.returnHow}</b><br>${esc(instructions)}</div>` : `<p style="font-size:14px;line-height:1.5">${L.returnMention(number)}</p>`}`),
  };
}

export function returnDeclinedEmail(store: Store, number: number, reason: string, locale: Locale = "fr") {
  const L = T[locale];
  return {
    subject: L.returnSubject(number),
    html: layout(store.name, L.returnDeclinedTitle,
      `<p style="font-size:14px;line-height:1.5">${L.returnDeclinedBody(number)}</p>
${reason ? `<p style="font-size:14px;line-height:1.5;color:#616161">${L.reason}${locale === "en" ? ":" : " :"} ${esc(reason)}</p>` : ""}
<p style="font-size:14px;line-height:1.5">${esc(L.replyQuestion)}</p>`, undefined, locale),
  };
}

export function invoiceEmail(store: Store, order: Order & { items: OrderItem[] }, link: string, message: string, locale: Locale = orderLocale(order)) {
  const L = T[locale];
  const t = texts(store, "invoice", { prenom: firstName(order.name), numero: String(order.number), montant: money(order.totalCents, store.currency, locale) }, locale);
  return {
    subject: t.subject,
    html: t.layout(t.title,
      `${message ? `<p style="font-size:14px;line-height:1.5;white-space:pre-line">${esc(message)}</p>` : t.intro}
${itemsTable(order, store.currency, locale)}
<p>${t.button(link, L.pay(money(order.totalCents, store.currency, locale)))}</p>
<p style="font-size:12px;color:#8a8a8a">${L.copyLink} ${esc(link)}</p>`),
  };
}

export function purchaseOrderEmail(store: Store, po: { number: number; note: string; expectedAt: Date | null; shippingCents: number; items: { productTitle: string; variantTitle: string; sku: string; quantity: number; costCents: number }[] }) {
  const m = (c: number) => formatMoney(c, store.currency);
  const rows = po.items.map((i) => `<tr><td style="padding:6px 0;border-bottom:1px solid #ebebeb">${esc(i.productTitle)}${i.variantTitle !== "Par défaut" ? ` · ${esc(i.variantTitle)}` : ""}${i.sku ? `<br><span style="color:#8a8a8a;font-size:12px">Réf. ${esc(i.sku)}</span>` : ""}</td><td align="right" style="padding:6px 0;border-bottom:1px solid #ebebeb">${i.quantity}</td><td align="right" style="padding:6px 0;border-bottom:1px solid #ebebeb">${m(i.costCents)}</td></tr>`).join("");
  const total = po.items.reduce((s, i) => s + i.quantity * i.costCents, 0) + po.shippingCents;
  return {
    subject: `Bon de commande n° ${po.number} – ${store.name}`,
    html: layout(store.name, `Bon de commande n° ${po.number}`,
      `<p style="font-size:14px;line-height:1.5">Bonjour, voici notre commande${po.expectedAt ? `, à livrer si possible avant le <b>${po.expectedAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</b>` : ""}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:12px 0"><tr><th align="left" style="font-size:12px;color:#616161">Article</th><th align="right" style="font-size:12px;color:#616161">Qté</th><th align="right" style="font-size:12px;color:#616161">Prix unitaire</th></tr>${rows}
${po.shippingCents ? `<tr><td colspan="2" style="padding:6px 0;color:#616161">Frais de port</td><td align="right">${m(po.shippingCents)}</td></tr>` : ""}<tr><td colspan="2" style="padding:6px 0;font-weight:700">Total</td><td align="right" style="font-weight:700">${m(total)}</td></tr></table>
${po.note ? `<p style="font-size:14px;line-height:1.5;white-space:pre-line;color:#616161">${esc(po.note)}</p>` : ""}
<p style="font-size:13px;color:#616161">Merci de confirmer la commande en répondant à cet e-mail.</p>`),
  };
}

export function backInStockEmail(store: Store, product: { title: string; image: string | null }, variantTitle: string, url: string, priceCents: number, locale: Locale = "fr") {
  const L = T[locale];
  const name = `${product.title}${variantTitle !== "Par défaut" ? ` (${variantTitle})` : ""}`;
  return {
    subject: L.backSubject(name, store.name),
    html: layout(store.name, L.backTitle,
      `${product.image && /^https?:\/\//.test(product.image) ? `<img src="${esc(product.image)}" alt="" width="240" style="display:block;border-radius:8px;margin:0 0 16px">` : ""}
<p style="font-size:14px;line-height:1.5">${L.backBody(esc(name), money(priceCents, store.currency, locale))}</p>
<p>${button(url, L.backCta)}</p>
<p style="font-size:12px;color:#8a8a8a">${esc(L.backFooter)}</p>`, undefined, locale),
  };
}

export function chatAlertEmail(store: Store, name: string, email: string, body: string, conversationId: string) {
  return {
    subject: `[${store.name}] Nouveau message de ${name}`,
    html: layout(store.name, `Message de ${name}`,
      `<p style="font-size:13px;color:#616161">${esc(email)}</p>
<div style="font-size:14px;line-height:1.5;background:#f7f7f7;border-radius:8px;padding:12px 14px;white-space:pre-line">${esc(body)}</div>
<p style="margin-top:16px">${button(`${appUrl()}/admin/inbox?c=${conversationId}`, "Répondre")}</p>`),
  };
}

export function chatReplyEmail(store: Store, name: string, authorName: string, body: string, link: string, locale: Locale = "fr") {
  const L = T[locale];
  return {
    subject: L.chatSubject(store.name),
    html: layout(store.name, L.chatHello(name),
      `<div style="font-size:14px;line-height:1.5;background:#f7f7f7;border-radius:8px;padding:12px 14px;white-space:pre-line">${esc(body)}</div>
<p style="font-size:13px;color:#616161">${esc(authorName)}, ${esc(store.name)}</p>
<p>${button(link, L.chatContinue)}</p>`, undefined, locale),
  };
}

export function pickupReadyEmail(store: Store, order: Order & { items: OrderItem[] }, locale: Locale = orderLocale(order)) {
  const t = texts(store, "pickup_ready", { prenom: firstName(order.name), numero: String(order.number) }, locale);
  return {
    subject: t.subject,
    html: t.layout(t.title, `${t.intro}
${addressBlock(order, store, locale)}${itemsTable(order, store.currency, locale)}`),
  };
}
