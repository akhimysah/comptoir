"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { fieldMode } from "@/lib/checkout-settings";

/** Page de paiement : champs demandés au client, case marketing, limite du panier, dates de livraison estimées. */
export async function saveCheckoutSettings(form: FormData) {
  const { store } = await requireOwner();
  const fail = (m: string) => redirect(`/admin/settings/checkout?err=${encodeURIComponent(m)}`);
  const num = (k: string) => { const v = String(form.get(k) ?? "").trim(); return v === "" ? null : Math.floor(Number(v)); };
  const estimates = form.get("estimates") === "on";
  let deliveryMinDays = estimates ? num("deliveryMinDays") : null;
  let deliveryMaxDays = estimates ? num("deliveryMaxDays") : null;
  if (estimates) {
    if (deliveryMinDays === null || deliveryMaxDays === null || !(deliveryMinDays >= 0 && deliveryMinDays <= 90) || !(deliveryMaxDays >= 0 && deliveryMaxDays <= 90)) fail("Dates de livraison estimées : indiquez un minimum et un maximum entre 0 et 90 jours ouvrés.");
    if (deliveryMaxDays! < deliveryMinDays!) [deliveryMinDays, deliveryMaxDays] = [deliveryMaxDays, deliveryMinDays];
  }
  await db.store.update({
    where: { id: store.id },
    data: {
      checkoutPhone: fieldMode(form.get("checkoutPhone"), "optional"),
      checkoutCompany: fieldMode(form.get("checkoutCompany"), "hidden"),
      checkoutAddress2: form.get("checkoutAddress2") === "on",
      marketingPreselect: form.get("marketingPreselect") === "on",
      cartLimit: form.get("cartLimit") === "on",
      deliveryMinDays,
      deliveryMaxDays,
    },
  });
  await logActivity("Page de paiement modifiée", "/admin/settings/checkout");
  revalidatePath(`/s/${store.slug}`, "layout");
  redirect("/admin/settings/checkout?ok=1");
}
