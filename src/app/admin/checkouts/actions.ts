"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { remindCheckout } from "@/lib/automations";
import { db } from "@/lib/db";

export async function sendReminder(form: FormData) {
  const { store } = await requirePerm("orders");
  await remindCheckout(store, String(form.get("id")));
  revalidatePath("/admin/checkouts");
}

export async function deleteCheckout(form: FormData) {
  const { store } = await requirePerm("orders");
  await db.checkout.deleteMany({ where: { id: String(form.get("id")), storeId: store.id } });
  revalidatePath("/admin/checkouts");
}
