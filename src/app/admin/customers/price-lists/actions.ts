"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { requirePerm } from "@/lib/auth";
import { PAYMENT_TERMS } from "@/lib/b2b";
import { db } from "@/lib/db";
import { parseMoney } from "@/lib/money";
import { normalizeVatNumber } from "@/lib/tax";

const percent = (v: FormDataEntryValue | null) => Math.max(0, Math.min(90, Math.round(Number(String(v ?? "0").replace(",", ".")) || 0)));

export async function createPriceList(form: FormData) {
  const { store } = await requirePerm("customers");
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  if (!name) return;
  const list = await db.priceList.create({ data: { storeId: store.id, name, percentOff: percent(form.get("percentOff")) } });
  await logActivity(`Liste de prix « ${name} » créée`, `/admin/customers/price-lists/${list.id}`);
  redirect(`/admin/customers/price-lists/${list.id}`);
}

/** Nom, réduction générale et prix fixes (champ vide = prix fixe retiré). */
export async function savePriceList(form: FormData) {
  const { store } = await requirePerm("customers");
  const id = String(form.get("id"));
  const list = await db.priceList.findFirst({ where: { id, storeId: store.id } });
  if (!list) return;
  const name = String(form.get("name") ?? "").trim().slice(0, 60) || list.name;
  const variantIds = form.getAll("variantId").map(String).slice(0, 1000);
  const own = new Set((await db.variant.findMany({ where: { id: { in: variantIds }, product: { storeId: store.id } }, select: { id: true } })).map((v) => v.id));
  const set: { variantId: string; priceCents: number }[] = [];
  const clear: string[] = [];
  for (const v of variantIds) {
    if (!own.has(v)) continue;
    const raw = String(form.get(`price_${v}`) ?? "").trim();
    const cents = raw ? parseMoney(raw) : null;
    if (cents === null || cents < 0) clear.push(v);
    else set.push({ variantId: v, priceCents: cents });
  }
  await db.$transaction([
    db.priceList.update({ where: { id }, data: { name, percentOff: percent(form.get("percentOff")) } }),
    db.priceListPrice.deleteMany({ where: { priceListId: id, variantId: { in: clear } } }),
    ...set.map((p) => db.priceListPrice.upsert({ where: { priceListId_variantId: { priceListId: id, variantId: p.variantId } }, update: { priceCents: p.priceCents }, create: { priceListId: id, ...p } })),
  ]);
  await logActivity(`Liste de prix « ${name} » modifiée`, `/admin/customers/price-lists/${id}`);
  revalidatePath(`/admin/customers/price-lists/${id}`);
  redirect(`/admin/customers/price-lists/${id}?saved=1${form.get("q") ? `&q=${encodeURIComponent(String(form.get("q")))}` : ""}`);
}

export async function deletePriceList(form: FormData) {
  const { store } = await requirePerm("customers");
  const id = String(form.get("id"));
  const r = await db.priceList.deleteMany({ where: { id, storeId: store.id } });
  if (r.count) await logActivity("Liste de prix supprimée");
  redirect("/admin/customers/price-lists");
}

/** Fiche client : société, n° de TVA, liste de prix et délai de paiement. */
export async function saveCustomerB2B(form: FormData) {
  const { store } = await requirePerm("customers");
  const id = String(form.get("id"));
  const listId = String(form.get("priceListId") ?? "");
  const list = listId ? await db.priceList.findFirst({ where: { id: listId, storeId: store.id }, select: { id: true } }) : null;
  const days = Number(form.get("paymentTermsDays"));
  await db.customer.updateMany({
    where: { id, storeId: store.id },
    data: {
      company: String(form.get("company") ?? "").trim().slice(0, 100),
      vatNumber: normalizeVatNumber(String(form.get("vatNumber") ?? "")).slice(0, 20),
      priceListId: list?.id ?? null,
      paymentTermsDays: (PAYMENT_TERMS as readonly number[]).includes(days) ? days : 0,
    },
  });
  revalidatePath(`/admin/customers/${id}`);
  revalidatePath("/admin/customers/price-lists");
}
