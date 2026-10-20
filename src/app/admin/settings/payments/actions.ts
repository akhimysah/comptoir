"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { MANUAL_DEFAULTS, MAX_CUSTOM_PAYMENTS, type ManualPayment } from "@/lib/checkout-settings";

/** Moyens de paiement manuels : virement, paiement à la livraison et jusqu'à 3 moyens personnalisés. */
export async function saveManualPayments(form: FormData) {
  const { store } = await requireOwner();
  const fail = (m: string) => redirect(`/admin/settings/payments?err=${encodeURIComponent(m)}#manuels`);
  const str = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const list: ManualPayment[] = [];
  for (const key of ["bank_transfer", "cod"] as const) {
    const enabled = form.get(`${key}_enabled`) === "on";
    const name = str(`${key}_name`, 60) || MANUAL_DEFAULTS[key].name;
    const instructions = str(`${key}_instructions`, 2000);
    if (enabled && instructions.length < 10) fail(`« ${name} » : indiquez les consignes de paiement que recevra le client.`);
    list.push({ key, name, instructions, enabled });
  }
  for (let i = 0; i < MAX_CUSTOM_PAYMENTS; i++) {
    const name = str(`custom${i}_name`, 60);
    const instructions = str(`custom${i}_instructions`, 2000);
    const enabled = form.get(`custom${i}_enabled`) === "on";
    if (!name && !instructions) continue;
    if (!name) fail("Donnez un nom à chaque moyen de paiement personnalisé.");
    if (enabled && instructions.length < 10) fail(`« ${name} » : indiquez les consignes de paiement que recevra le client.`);
    list.push({ key: "custom", name, instructions, enabled });
  }
  await db.store.update({ where: { id: store.id }, data: { manualPayments: JSON.stringify(list) } });
  const on = list.filter((m) => m.enabled).map((m) => m.name);
  await logActivity(`Moyens de paiement manuels : ${on.join(", ") || "aucun"}`, "/admin/settings/payments");
  revalidatePath("/admin/settings", "layout");
  revalidatePath(`/s/${store.slug}`, "layout");
  redirect("/admin/settings/payments?ok=1#manuels");
}

/** Crédit en magasin : les clients voient leur solde dans « Mon compte » et il est déduit automatiquement au paiement. */
export async function saveStoreCredit(form: FormData) {
  const { store } = await requireOwner();
  await db.store.update({ where: { id: store.id }, data: { storeCreditEnabled: form.get("enabled") === "on" } });
  await logActivity(form.get("enabled") === "on" ? "Crédit en magasin activé" : "Crédit en magasin désactivé", "/admin/settings/payments");
  revalidatePath("/admin/settings/payments");
  redirect("/admin/settings/payments?ok=1#credit");
}
