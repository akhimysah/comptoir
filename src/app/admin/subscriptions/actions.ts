"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requirePerm } from "@/lib/auth";
import { renewSubscription, setSubscriptionStatus } from "@/lib/renewals";

export async function changeSubscription(form: FormData) {
  const { store } = await requirePerm("orders");
  const id = String(form.get("id"));
  const status = String(form.get("status")) as "active" | "paused" | "cancelled";
  if (!["active", "paused", "cancelled"].includes(status)) return;
  const res = await setSubscriptionStatus(store.id, id, status);
  if (!res.error) await logActivity(`Abonnement ${status === "active" ? "repris" : status === "paused" ? "mis en pause" : "résilié"}`, "/admin/subscriptions");
  revalidatePath("/admin/subscriptions");
}

/** Crée tout de suite la commande de la prochaine échéance (utile pour tester ou avancer une livraison). */
export async function renewNow(form: FormData) {
  await requirePerm("orders");
  const order = await renewSubscription(String(form.get("id")));
  if (order) await logActivity(`Échéance d'abonnement créée : commande #${order.number}`, `/admin/orders/${order.id}`);
  revalidatePath("/admin/subscriptions");
}
