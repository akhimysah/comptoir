"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createLoginCode, getCustomer, logoutCustomer, verifyLoginCode } from "@/lib/customer-auth";
import { db } from "@/lib/db";
import { loginCodeEmail } from "@/lib/emails";
import { sendMail } from "@/lib/mail";
import { redeemReward } from "@/lib/loyalty";
import { setSubscriptionStatus } from "@/lib/renewals";
import { clientIp, hit } from "@/lib/rate-limit";
import { requestReturn } from "@/lib/returns";
import type { Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

const MSG = {
  noStore: { fr: "Boutique introuvable.", en: "Store not found." },
  email: { fr: "Indiquez une adresse e-mail valide.", en: "Enter a valid email address." },
  wait: { fr: "Un code vient d'être envoyé. Patientez 30 secondes avant d'en demander un autre.", en: "A code was just sent. Wait 30 seconds before requesting another one." },
  tooMany: { fr: "Trop de codes demandés. Réessayez dans une heure.", en: "Too many codes requested. Try again in an hour." },
};

/** Messages renvoyés par src/lib (connexion, fidélité, retours), traduits pour un client anglophone. */
const EN: Record<string, string> = {
  "Ce code a expiré. Demandez-en un nouveau.": "This code has expired. Request a new one.",
  "Trop d'essais. Demandez un nouveau code.": "Too many attempts. Request a new code.",
  "Code incorrect.": "Incorrect code.",
  "Ce code a déjà été utilisé. Demandez-en un nouveau.": "This code has already been used. Request a new one.",
  "Le programme de fidélité n'est pas actif.": "The loyalty program isn't active.",
  "Compte introuvable.": "Account not found.",
  "Commande introuvable.": "Order not found.",
  "Choisissez au moins un article à retourner.": "Choose at least one item to return.",
  "Quantité à retourner invalide.": "Invalid return quantity.",
  "Indiquez le motif du retour pour chaque article.": "Select a return reason for each item.",
  "La boutique ne propose pas de retour en ligne. Contactez-la directement.": "This store doesn't offer online returns. Please contact it directly.",
  "Cette commande ne peut pas être retournée.": "This order can't be returned.",
  "Votre commande n'a pas encore été expédiée : contactez la boutique pour la modifier ou l'annuler.": "Your order hasn't shipped yet: contact the store to change or cancel it.",
  "Tous les articles de cette commande sont déjà retournés ou remboursés.": "All items in this order have already been returned or refunded.",
};
function tr(msg: string, locale: Locale) {
  if (locale === "fr" || !msg) return msg;
  if (EN[msg]) return EN[msg];
  const points = msg.match(/^Il vous faut (\d+) points\.$/);
  if (points) return `You need ${points[1]} points.`;
  const days = msg.match(/^Le délai de retour de (\d+) jours est dépassé\.$/);
  if (days) return `The ${days[1]}-day return window has passed.`;
  return msg;
}

async function storeOf(slug: string) {
  const store = await db.store.findUnique({ where: { slug } });
  if (!store) throw new Error(MSG.noStore.fr);
  return store;
}

export async function requestCode(slug: string, emailRaw: string): Promise<{ error?: string }> {
  const parsed = z.string().trim().toLowerCase().email().safeParse(emailRaw);
  if (!parsed.success) {
    const found = await db.store.findUnique({ where: { slug } });
    return { error: MSG.email[found ? await getLocale(found) : "fr"] };
  }
  const store = await storeOf(slug);
  const locale = await getLocale(store);
  const recent = await db.customerLoginCode.findFirst({ where: { storeId: store.id, email: parsed.data, createdAt: { gt: new Date(Date.now() - 30_000) } } });
  if (recent) return { error: MSG.wait[locale] };
  if (!(await hit(`code:${store.id}:${parsed.data}`, 5, 3600_000)) || !(await hit(`code:ip:${await clientIp()}`, 20, 3600_000)))
    return { error: MSG.tooMany[locale] };
  const code = await createLoginCode(store.id, parsed.data);
  if (!process.env.RESEND_API_KEY && process.env.NODE_ENV !== "production") console.log(`[compte client] Code pour ${parsed.data} sur ${store.name} : ${code}`);
  await sendMail({ to: parsed.data, storeId: store.id, ...loginCodeEmail(store, code, locale) });
  return {};
}

export async function confirmCode(slug: string, email: string, code: string): Promise<{ error?: string }> {
  const store = await storeOf(slug);
  const res = await verifyLoginCode(store.id, slug, email.trim().toLowerCase(), code);
  if (res.error) return { error: tr(res.error, await getLocale(store)) };
  redirect(`/s/${slug}/account`);
}

export async function logout(form: FormData) {
  const slug = String(form.get("slug"));
  const store = await storeOf(slug);
  await logoutCustomer(store.id, slug);
  redirect(`/s/${slug}`);
}

export async function updateName(form: FormData) {
  const slug = String(form.get("slug"));
  const store = await storeOf(slug);
  const customer = await getCustomer(store.id);
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  if (customer && name) await db.customer.update({ where: { id: customer.id }, data: { name } });
  redirect(`/s/${slug}/account?saved=1`);
}

export async function redeemPoints(form: FormData) {
  const slug = String(form.get("slug"));
  const store = await storeOf(slug);
  const customer = await getCustomer(store.id);
  if (!customer) redirect(`/s/${slug}/account/login`);
  const res = await redeemReward(store, customer.id);
  redirect(`/s/${slug}/account?${res.code ? `code=${res.code}` : `err=${encodeURIComponent(tr(res.error ?? "", await getLocale(store)))}`}`);
}

export async function customerSubscription(form: FormData) {
  const slug = String(form.get("slug"));
  const store = await storeOf(slug);
  const customer = await getCustomer(store.id);
  if (!customer) redirect(`/s/${slug}/account/login`);
  const status = String(form.get("status")) as "active" | "paused" | "cancelled";
  if (["active", "paused", "cancelled"].includes(status)) await setSubscriptionStatus(store.id, String(form.get("id")), status, customer.id);
  redirect(`/s/${slug}/account`);
}

export async function submitReturn(form: FormData) {
  const slug = String(form.get("slug"));
  const orderId = String(form.get("orderId"));
  const store = await storeOf(slug);
  const customer = await getCustomer(store.id);
  if (!customer) redirect(`/s/${slug}/account/login`);
  const ids = form.getAll("item").map(String);
  const lines = ids.map((id) => ({ orderItemId: id, quantity: Math.floor(Number(form.get(`qty_${id}`) ?? 0)) || 0, reason: String(form.get(`reason_${id}`) ?? "") }));
  const res = await requestReturn(store.id, orderId, customer, lines, String(form.get("note") ?? "").trim());
  if (res.error) redirect(`/s/${slug}/account/returns/${orderId}?err=${encodeURIComponent(tr(res.error, await getLocale(store)))}`);
  redirect(`/s/${slug}/account?return=1`);
}
