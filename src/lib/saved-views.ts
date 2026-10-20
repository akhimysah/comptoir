"use server";

import { revalidatePath } from "next/cache";
import { requirePerm, type Area } from "@/lib/auth";
import { db } from "@/lib/db";

/** Vues enregistrées des listes de l'admin (filtres gardés sous un nom), comme les onglets personnalisés de Shopify. */
export type ViewPage = "orders" | "products" | "customers";
const AREA: Record<ViewPage, Area> = { orders: "orders", products: "products", customers: "customers" };
const PATH: Record<ViewPage, string> = { orders: "/admin/orders", products: "/admin/products", customers: "/admin/customers" };

/** Paramètres autorisés dans une vue (jamais de paramètre technique ni de pagination). */
const ALLOWED = /^(tab|q|tag|channel|vendor|type|segment|priceList|filter|loc|status)$/;

export async function saveView(form: FormData) {
  const page = String(form.get("page")) as ViewPage;
  if (!(page in AREA)) return;
  const { store } = await requirePerm(AREA[page]);
  const name = String(form.get("name") ?? "").trim().slice(0, 40);
  const params = new URLSearchParams(String(form.get("query") ?? ""));
  for (const k of [...params.keys()]) if (!ALLOWED.test(k)) params.delete(k);
  if (!name || ![...params.keys()].length) return;
  if ((await db.savedView.count({ where: { storeId: store.id, page } })) >= 12) return;
  await db.savedView.create({ data: { storeId: store.id, page, name, query: params.toString(), position: Date.now() % 1_000_000 } });
  revalidatePath(PATH[page]);
}

export async function deleteView(form: FormData) {
  const page = String(form.get("page")) as ViewPage;
  if (!(page in AREA)) return;
  const { store } = await requirePerm(AREA[page]);
  await db.savedView.deleteMany({ where: { id: String(form.get("id")), storeId: store.id } });
  revalidatePath(PATH[page]);
}
