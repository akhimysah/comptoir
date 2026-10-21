"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isPlatformAdmin } from "@/lib/errors";

const admin = async () => { const user = await requireUser(); if (!isPlatformAdmin(user.email)) throw new Error("Réservé à l'administrateur."); };

/** Fiche d'un thème de la bibliothèque : nom, description, capture. */
export async function savePlatformTheme(form: FormData) {
  await admin();
  const id = String(form.get("id") ?? "");
  const thumbnail = String(form.get("thumbnail") ?? "").trim();
  await db.platformTheme.update({ where: { id }, data: { name: String(form.get("name") ?? "").trim().slice(0, 60) || "Thème", description: String(form.get("description") ?? "").trim().slice(0, 200), thumbnail: /^(https?:)?\//.test(thumbnail) ? thumbnail : null } });
  revalidatePath("/admin/platform/themes"); revalidatePath("/admin/theme");
}

export async function deletePlatformTheme(form: FormData) {
  await admin();
  await db.platformTheme.delete({ where: { id: String(form.get("id") ?? "") } });
  revalidatePath("/admin/platform/themes"); revalidatePath("/admin/theme");
}
