import "server-only";
import { randomBytes } from "crypto";
import { db } from "./db";
import { chatAlertEmail, chatReplyEmail } from "./emails";
import { sendMail } from "./mail";
import { appUrl } from "./stripe";
import { storeBase } from "./domains";

const MAX = 2000;
const clean = (s: string) => s.replace(/\r\n/g, "\n").trim().slice(0, MAX);

export type ThreadMessage = { id: string; fromCustomer: boolean; authorName: string; body: string; at: string };
const toThread = (m: { id: string; fromCustomer: boolean; authorName: string; body: string; createdAt: Date }): ThreadMessage => ({ id: m.id, fromCustomer: m.fromCustomer, authorName: m.authorName, body: m.body, at: m.createdAt.toISOString() });

/** Alerte la boutique par e-mail, au plus une fois par quart d'heure et par conversation. */
async function alertMerchant(conversationId: string, body: string) {
  const c = await db.conversation.findUnique({ where: { id: conversationId }, include: { store: { include: { owner: true } } } });
  if (!c) return;
  const since = new Date(Date.now() - 15 * 60_000);
  const claimed = await db.conversation.updateMany({ where: { id: c.id, OR: [{ notifiedAt: null }, { notifiedAt: { lt: since } }] }, data: { notifiedAt: new Date() } });
  if (claimed.count) await sendMail({ to: c.store.owner.email, storeId: c.storeId, ...chatAlertEmail(c.store, c.name, c.email, body, c.id) });
}

export async function startConversation(storeId: string, name: string, email: string, body: string) {
  const token = randomBytes(24).toString("base64url");
  const text = clean(body);
  const c = await db.conversation.create({ data: { storeId, token, name: name.trim().slice(0, 80), email: email.trim().toLowerCase(), unread: 1, messages: { create: { fromCustomer: true, authorName: name.trim().slice(0, 80), body: text } } } });
  await alertMerchant(c.id, text);
  return token;
}

export async function conversationByToken(storeId: string, token: string) {
  return db.conversation.findFirst({ where: { token, storeId } });
}

export async function thread(conversationId: string) {
  const msgs = await db.chatMessage.findMany({ where: { conversationId }, orderBy: { createdAt: "desc" }, take: 100 });
  return msgs.reverse().map(toThread);
}

export async function postCustomerMessage(conversationId: string, name: string, body: string) {
  const text = clean(body);
  await db.$transaction([
    db.chatMessage.create({ data: { conversationId, fromCustomer: true, authorName: name, body: text } }),
    // Un nouveau message rouvre une conversation close.
    db.conversation.update({ where: { id: conversationId }, data: { unread: { increment: 1 }, lastMessageAt: new Date(), status: "open" } }),
  ]);
  await alertMerchant(conversationId, text);
}

/** Réponse de la boutique : visible dans la bulle et envoyée par e-mail avec un lien pour reprendre la conversation. */
export async function replyToConversation(storeId: string, conversationId: string, authorName: string, body: string): Promise<{ error?: string }> {
  const c = await db.conversation.findFirst({ where: { id: conversationId, storeId }, include: { store: true } });
  if (!c) return { error: "Conversation introuvable." };
  const text = clean(body);
  if (!text) return { error: "Écrivez un message." };
  await db.$transaction([
    db.chatMessage.create({ data: { conversationId: c.id, fromCustomer: false, authorName, body: text } }),
    db.conversation.update({ where: { id: c.id }, data: { unread: 0, lastMessageAt: new Date() } }),
  ]);
  const link = `${storeBase(c.store)}?chat=${c.token}`;
  await sendMail({ to: c.email, storeId, ...chatReplyEmail(c.store, c.name, authorName, text, link) });
  return {};
}
