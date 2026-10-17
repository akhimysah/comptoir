"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { PRIMARY } from "@/lib/locations";

const clean = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);

export async function saveLocation(form: FormData) {
  const { store } = await requireOwner();
  const id = String(form.get("id") ?? "");
  const name = clean(form.get("name"), 60);
  if (!name) return;
  if (id === PRIMARY) await db.store.update({ where: { id: store.id }, data: { primaryLocationName: name } });
  else if (id) await db.location.updateMany({ where: { id, storeId: store.id }, data: { name, address: clean(form.get("address"), 300) } });
  else {
    if ((await db.location.count({ where: { storeId: store.id } })) >= 20) return;
    await db.location.create({ data: { storeId: store.id, name, address: clean(form.get("address"), 300) } });
    await logActivity(`Emplacement « ${name} » ajouté`, "/admin/settings/locations");
  }
  revalidatePath("/admin/settings/locations");
  revalidatePath("/admin/inventory");
}

/** Suppression : le stock de l'emplacement revient à l'emplacement principal (le stock total ne change pas). */
export async function deleteLocation(form: FormData) {
  const { store } = await requireOwner();
  const loc = await db.location.findFirst({ where: { id: String(form.get("id")), storeId: store.id } });
  if (!loc) return;
  await db.location.delete({ where: { id: loc.id } });
  await logActivity(`Emplacement « ${loc.name} » supprimé (stock rendu à ${store.primaryLocationName})`, "/admin/settings/locations");
  revalidatePath("/admin/settings/locations");
  revalidatePath("/admin/inventory");
}
