"use server";

import { logActivity } from "@/lib/activity";

import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyBackInStock } from "@/lib/stock-alerts";
import { ownLocation, PRIMARY, setLocationStock, transferStock } from "@/lib/locations";
import { redirect } from "next/navigation";

export async function setStock(variantId: string, stock: number, locationId: string = PRIMARY): Promise<{ error?: string; total?: number }> {
  const { store } = await requirePerm("products");
  const qty = Math.floor(stock);
  if (!Number.isFinite(qty) || qty < 0 || qty > 1_000_000) return { error: "Quantité invalide." };
  const location = await ownLocation(store.id, locationId);
  if (!location) return { error: "Emplacement introuvable." };
  let total: number;
  try { total = await setLocationStock(store.id, variantId, location, qty); } catch { return { error: "Variante introuvable." }; }
  if (total > 0) await notifyBackInStock({ storeId: store.id, variantIds: [variantId] });
  await logActivity(`Stock modifié : ${qty} disponible(s)`, "/admin/inventory");
  revalidatePath("/admin/inventory");
  revalidatePath(`/s/${store.slug}`, "layout");
  return { total };
}

/** Transfert de stock d'un emplacement à un autre (formulaire de la page Stock). */
export async function transfer(form: FormData) {
  const { store } = await requirePerm("products");
  const [from, to] = await Promise.all([ownLocation(store.id, String(form.get("from"))), ownLocation(store.id, String(form.get("to")))]);
  const back = `/admin/inventory?loc=${encodeURIComponent(String(form.get("from") ?? ""))}`;
  if (!from || !to) redirect(`${back}&err=${encodeURIComponent("Emplacement introuvable.")}`);
  const qty = Math.floor(Number(form.get("qty")));
  const r = await transferStock(store.id, String(form.get("variantId")), from!, to!, qty);
  if (r.error) redirect(`${back}&err=${encodeURIComponent(r.error)}`);
  await logActivity(`Transfert de stock : ${qty} article(s)`, "/admin/inventory");
  revalidatePath("/admin/inventory");
  redirect(`${back}&ok=1`);
}
