"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseMoney, formatMoney } from "@/lib/money";
import { adjustStoreCredit } from "@/lib/store-credit";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { addCustomerEvent } from "@/lib/customer-events";
import { logActivity } from "@/lib/activity";
import { subscribe } from "@/lib/marketing";
import { splitTags } from "@/lib/segments";
import { isLocale } from "@/lib/i18n";

export async function saveCustomerNote(form: FormData) {
  const { store } = await requirePerm("customers");
  const id = String(form.get("id"));
  const note = String(form.get("note") ?? "").slice(0, 2000);
  const before = await db.customer.findFirst({ where: { id, storeId: store.id }, select: { note: true } });
  if (!before) return;
  await db.customer.update({ where: { id }, data: { note } });
  if (note !== before.note) await addCustomerEvent(store.id, id, "note", note.trim() ? "La note sur ce client a été modifiée." : "La note sur ce client a été supprimée.");
  revalidatePath(`/admin/customers/${id}`);
}

export async function adjustPoints(form: FormData) {
  const { store } = await requirePerm("customers");
  const id = String(form.get("id"));
  const delta = Math.trunc(Number(form.get("points")));
  const reason = String(form.get("reason") ?? "").trim().slice(0, 100) || "Ajustement manuel";
  const c = await db.customer.findFirst({ where: { id, storeId: store.id } });
  if (!c || !delta) return;
  const next = Math.max(0, c.points + delta);
  await db.$transaction([
    db.customer.update({ where: { id: c.id }, data: { points: next } }),
    db.loyaltyEntry.create({ data: { storeId: store.id, customerId: c.id, points: next - c.points, reason } }),
  ]);
  const diff = next - c.points;
  await addCustomerEvent(store.id, id, "points", `${diff > 0 ? "+" : ""}${diff} point${Math.abs(diff) > 1 ? "s" : ""} de fidélité (${reason}) : solde ${next}.`);
  revalidatePath(`/admin/customers/${id}`);
}

export async function saveCustomerTags(form: FormData) {
  const { store } = await requirePerm("customers");
  const id = String(form.get("id"));
  const before = await db.customer.findFirst({ where: { id, storeId: store.id }, select: { tags: true } });
  if (!before) return;
  const tags = splitTags(String(form.get("tags") ?? "")).map((t) => t.slice(0, 30)).slice(0, 20).join(", ");
  await db.customer.update({ where: { id }, data: { tags } });
  const old = splitTags(before.tags), now = splitTags(tags);
  const added = now.filter((t) => !old.includes(t)), removed = old.filter((t) => !now.includes(t));
  if (added.length || removed.length) {
    const parts = [added.length ? `Étiquette${added.length > 1 ? "s" : ""} ajoutée${added.length > 1 ? "s" : ""} : ${added.join(", ")}` : "", removed.length ? `Étiquette${removed.length > 1 ? "s" : ""} retirée${removed.length > 1 ? "s" : ""} : ${removed.join(", ")}` : ""].filter(Boolean);
    await addCustomerEvent(store.id, id, "tags", `${parts.join(". ")}.`);
  }
  revalidatePath(`/admin/customers/${id}`);
  revalidatePath("/admin/customers");
}

/** Langue des notifications envoyées à ce client (e-mails de commande, campagnes). */
export async function saveCustomerLocale(form: FormData) {
  const { store } = await requirePerm("customers");
  const id = String(form.get("id"));
  const locale = String(form.get("locale") ?? "fr");
  if (!isLocale(locale)) return;
  const before = await db.customer.findFirst({ where: { id, storeId: store.id }, select: { locale: true } });
  if (!before || before.locale === locale) return;
  await db.customer.update({ where: { id }, data: { locale } });
  await addCustomerEvent(store.id, id, "locale", `Ce client recevra désormais les notifications en ${locale === "en" ? "anglais" : "français"}.`);
  revalidatePath(`/admin/customers/${id}`);
}

/** Abonnement aux e-mails marketing (bouton « S'abonner » / « Se désabonner » de la fiche client). */
export async function setCustomerMarketing(form: FormData) {
  const { store } = await requirePerm("customers");
  const id = String(form.get("id"));
  const on = String(form.get("subscribe")) === "1";
  const c = await db.customer.findFirst({ where: { id, storeId: store.id } });
  if (!c || c.acceptsMarketing === on) return;
  if (on) await subscribe(store.id, c.email, c.name);
  else await db.customer.update({ where: { id }, data: { acceptsMarketing: false } });
  await addCustomerEvent(store.id, id, "marketing", on ? "Ce client a été abonné aux e-mails marketing par un employé." : "Ce client a été désabonné des e-mails marketing par un employé.");
  await logActivity(on ? `Client ${c.email} abonné aux e-mails` : `Client ${c.email} désabonné des e-mails`, `/admin/customers/${id}`);
  revalidatePath(`/admin/customers/${id}`);
  revalidatePath("/admin/customers");
}

/** « Percevoir la taxe » : un client exonéré paie hors taxes sur la boutique. */
export async function setCustomerTaxExempt(form: FormData) {
  const { store } = await requirePerm("customers");
  const id = String(form.get("id"));
  const taxExempt = form.get("taxExempt") === "on";
  const c = await db.customer.findFirst({ where: { id, storeId: store.id }, select: { taxExempt: true, email: true } });
  if (!c || c.taxExempt === taxExempt) return;
  await db.customer.update({ where: { id }, data: { taxExempt } });
  await addCustomerEvent(store.id, id, "tax", taxExempt ? "Ce client est désormais exonéré de taxe : ses commandes sont facturées hors taxes." : "La taxe est de nouveau perçue sur les commandes de ce client.");
  await logActivity(taxExempt ? `Client ${c.email} exonéré de taxe` : `Taxe de nouveau perçue pour ${c.email}`, `/admin/customers/${id}`);
  revalidatePath(`/admin/customers/${id}`);
}

/** Commentaire d'un employé dans la chronologie du client (visible seulement par l'équipe). */
export async function addCustomerComment(form: FormData) {
  const { store, user } = await requirePerm("customers");
  const id = String(form.get("id"));
  const text = String(form.get("comment") ?? "").trim().slice(0, 2000);
  if (!text) return;
  const c = await db.customer.findFirst({ where: { id, storeId: store.id }, select: { id: true } });
  if (!c) return;
  await addCustomerEvent(store.id, id, "comment", `${user.name} : ${text}`);
  revalidatePath(`/admin/customers/${id}`);
}

export async function deleteCustomerComment(form: FormData) {
  const { store } = await requirePerm("customers");
  const id = String(form.get("id"));
  const customerId = String(form.get("customerId"));
  await db.customerEvent.deleteMany({ where: { id, storeId: store.id, type: "comment" } });
  revalidatePath(`/admin/customers/${customerId}`);
}

/** Crédit en magasin : ajout ou retrait manuel (geste commercial, correction). */
export async function adjustCredit(form: FormData) {
  const { user, store } = await requirePerm("customers");
  const id = String(form.get("id"));
  const cents = parseMoney(String(form.get("amount") ?? ""));
  const reason = String(form.get("reason") ?? "").trim().slice(0, 120) || "Ajustement manuel";
  if (!cents) return;
  const delta = form.get("direction") === "remove" ? -cents : cents;
  const entry = await adjustStoreCredit(store.id, id, delta, reason, user.name);
  if (!entry) redirect(`/admin/customers/${id}?err=${encodeURIComponent("Le solde ne peut pas devenir négatif.")}`);
  await addCustomerEvent(store.id, id, "credit", `${delta > 0 ? "+" : "−"}${formatMoney(Math.abs(delta), store.currency)} de crédit en magasin · ${reason}`);
  await logActivity(`Crédit en magasin ${delta > 0 ? "ajouté" : "retiré"} : ${formatMoney(Math.abs(delta), store.currency)}`, `/admin/customers/${id}`);
  revalidatePath(`/admin/customers/${id}`);
}
