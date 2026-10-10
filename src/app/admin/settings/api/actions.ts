"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { isScope, newApiKey } from "@/lib/api";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkWebhookUrl, emit, isTopic, newWebhookSecret } from "@/lib/webhooks";

export type KeyState = { key?: string; error?: string } | undefined;

/** Crée une clé ; elle n'est renvoyée qu'ici, une seule fois. */
export async function createApiKey(_: KeyState, form: FormData): Promise<KeyState> {
  const { store } = await requireOwner();
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  const scopes = form.getAll("scopes").map(String).filter(isScope);
  if (!name) return { error: "Donnez un nom à la clé (ex. « Logiciel de caisse »)." };
  if (!scopes.length) return { error: "Choisissez au moins un droit." };
  if ((await db.apiKey.count({ where: { storeId: store.id } })) >= 20) return { error: "20 clés au maximum : supprimez celles qui ne servent plus." };
  const k = newApiKey();
  await db.apiKey.create({ data: { storeId: store.id, name, prefix: k.prefix, keyHash: k.keyHash, scopes: JSON.stringify(scopes) } });
  await logActivity(`Clé d'API « ${name} » créée`, "/admin/settings/api");
  revalidatePath("/admin/settings/api");
  return { key: k.key };
}

export async function deleteApiKey(form: FormData) {
  const { store } = await requireOwner();
  const k = await db.apiKey.findFirst({ where: { id: String(form.get("id")), storeId: store.id } });
  if (!k) return;
  await db.apiKey.delete({ where: { id: k.id } });
  await logActivity(`Clé d'API « ${k.name} » révoquée`, "/admin/settings/api");
  revalidatePath("/admin/settings/api");
}

export type HookState = { error?: string; ok?: boolean } | undefined;

export async function createWebhook(_: HookState, form: FormData): Promise<HookState> {
  const { store } = await requireOwner();
  const url = String(form.get("url") ?? "").trim().slice(0, 500);
  const topics = form.getAll("topics").map(String).filter(isTopic);
  if (!topics.length) return { error: "Choisissez au moins un événement." };
  const problem = await checkWebhookUrl(url);
  if (problem) return { error: problem };
  if ((await db.webhook.count({ where: { storeId: store.id } })) >= 20) return { error: "20 webhooks au maximum." };
  await db.webhook.create({ data: { storeId: store.id, url, topics: JSON.stringify(topics), secret: newWebhookSecret() } });
  await logActivity("Webhook ajouté", "/admin/settings/api");
  revalidatePath("/admin/settings/api");
  return { ok: true };
}

export async function deleteWebhook(form: FormData) {
  const { store } = await requireOwner();
  const r = await db.webhook.deleteMany({ where: { id: String(form.get("id")), storeId: store.id } });
  if (r.count) await logActivity("Webhook supprimé", "/admin/settings/api");
  revalidatePath("/admin/settings/api");
}

/** Envoi d'essai (« ping ») à toutes les adresses de la boutique abonnées à cet événement. */
export async function testWebhook(form: FormData) {
  const { store } = await requireOwner();
  const hook = await db.webhook.findFirst({ where: { id: String(form.get("id")), storeId: store.id } });
  if (!hook) return;
  // Un essai remet le compteur d'échecs à zéro, pour réactiver une adresse réparée.
  await db.webhook.update({ where: { id: hook.id }, data: { failures: 0 } });
  const topic = JSON.parse(hook.topics)[0];
  if (isTopic(topic)) await emit(store.id, topic, { test: true, message: "Envoi d'essai de Parnassa Pay", store: { id: store.id, name: store.name } });
  revalidatePath("/admin/settings/api");
}
