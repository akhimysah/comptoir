"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { requirePerm } from "@/lib/auth";
import { runAutomations } from "@/lib/automations";
import { db } from "@/lib/db";

export async function saveAutomations(form: FormData) {
  const { store } = await requirePerm("marketing");
  const n = (k: string, min: number, max: number, def: number) => { const v = Math.floor(Number(form.get(k))); return v >= min && v <= max ? v : def; };
  const data = {
    autoCartReminder: form.get("autoCartReminder") === "on",
    cartReminderHours: n("cartReminderHours", 1, 72, 4),
    autoReviewRequest: form.get("autoReviewRequest") === "on",
    reviewRequestDays: n("reviewRequestDays", 1, 60, 7),
  };
  await db.store.update({ where: { id: store.id }, data });
  await logActivity(`Automatisations : relance paniers ${data.autoCartReminder ? "activée" : "désactivée"}, demande d'avis ${data.autoReviewRequest ? "activée" : "désactivée"}`, "/admin/marketing/automations");
  revalidatePath("/admin/marketing/automations");
  redirect("/admin/marketing/automations?saved=1");
}

export async function runNow() {
  const { store } = await requirePerm("marketing");
  const r = await runAutomations(store.id);
  redirect(`/admin/marketing/automations?ran=${r.reminders}-${r.reviews}`);
}
