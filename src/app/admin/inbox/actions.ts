"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { requirePerm } from "@/lib/auth";
import { replyToConversation } from "@/lib/chat";
import { db } from "@/lib/db";

export async function replyAction(form: FormData) {
  const { user, store } = await requirePerm("customers");
  const id = String(form.get("id"));
  const res = await replyToConversation(store.id, id, user.name, String(form.get("body") ?? ""));
  if (res.error) redirect(`/admin/inbox?c=${id}&err=${encodeURIComponent(res.error)}`);
  revalidatePath("/admin", "layout");
  redirect(`/admin/inbox?c=${id}`);
}

export async function setConversationStatus(form: FormData) {
  const { store } = await requirePerm("customers");
  const id = String(form.get("id"));
  const status = form.get("status") === "closed" ? "closed" : "open";
  await db.conversation.updateMany({ where: { id, storeId: store.id }, data: { status, ...(status === "closed" ? { unread: 0 } : {}) } });
  revalidatePath("/admin", "layout");
  redirect(status === "closed" ? "/admin/inbox" : `/admin/inbox?c=${id}`);
}

export async function saveChatSettings(form: FormData) {
  const { store, isOwner } = await requirePerm("customers");
  if (!isOwner) return;
  const enabled = form.get("enabled") === "on";
  const greeting = String(form.get("greeting") ?? "").trim().slice(0, 300) || "Bonjour ! Comment pouvons-nous vous aider ?";
  await db.store.update({ where: { id: store.id }, data: { chatEnabled: enabled, chatGreeting: greeting } });
  await logActivity(`Messagerie ${enabled ? "activée" : "désactivée"} sur la boutique`, "/admin/inbox");
  revalidatePath(`/s/${store.slug}`, "layout");
  redirect("/admin/inbox?settings=1");
}
