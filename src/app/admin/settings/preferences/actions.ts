"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";

export async function savePreferences(form: FormData) {
  const { store } = await requireOwner();
  const fail = (m: string) => redirect(`/admin/settings/preferences?err=${encodeURIComponent(m)}`);
  const passwordEnabled = form.get("passwordEnabled") === "on";
  const storePassword = String(form.get("storePassword") ?? "").trim().slice(0, 60);
  if (passwordEnabled && storePassword.length < 4) fail("Le mot de passe de la boutique doit faire au moins 4 caractères.");
  const gaId = String(form.get("gaId") ?? "").trim().toUpperCase();
  if (gaId && !/^G-[A-Z0-9]{4,20}$/.test(gaId)) fail("Identifiant Google Analytics invalide : il commence par « G- » (ex. G-AB12CD34EF).");
  const metaPixelId = String(form.get("metaPixelId") ?? "").replace(/\s/g, "");
  if (metaPixelId && !/^\d{6,20}$/.test(metaPixelId)) fail("Identifiant du Pixel Meta invalide : uniquement des chiffres.");
  await db.store.update({
    where: { id: store.id },
    data: { passwordEnabled, storePassword, passwordMessage: String(form.get("passwordMessage") ?? "").trim().slice(0, 300) || "Notre boutique ouvre très bientôt.", gaId, metaPixelId },
  });
  if (passwordEnabled !== store.passwordEnabled) await logActivity(passwordEnabled ? "Boutique protégée par mot de passe" : "Boutique ouverte au public (mot de passe retiré)", "/admin/settings/preferences");
  revalidatePath(`/s/${store.slug}`, "layout");
  redirect("/admin/settings/preferences?ok=1");
}
