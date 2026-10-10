"use server";

import { logActivity } from "@/lib/activity";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { COUNTRIES } from "@/lib/countries";
import { db } from "@/lib/db";
import { parseMoney } from "@/lib/money";

export type ZoneState = { error?: string; ok?: boolean } | undefined;
const refresh = () => revalidatePath("/admin/settings/shipping");

export async function saveZone(_: ZoneState, form: FormData): Promise<ZoneState> {
  const { store } = await requireOwner();
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  const countries = form.getAll("countries").map(String).filter((c) => (COUNTRIES as readonly string[]).includes(c));
  if (!name) return { error: "Donnez un nom à la zone." };
  if (!countries.length) return { error: "Cochez au moins un pays." };
  // Un pays ne peut appartenir qu'à une zone.
  const others = await db.shippingZone.findMany({ where: { storeId: store.id, NOT: { id: String(form.get("id") ?? "") } } });
  const taken = others.flatMap((z) => (JSON.parse(z.countries) as string[]).filter((c) => countries.includes(c)).map((c) => `${c} (${z.name})`));
  if (taken.length) return { error: `Déjà dans une autre zone : ${taken.join(", ")}.` };

  const id = String(form.get("id") ?? "");
  if (id) await db.shippingZone.updateMany({ where: { id, storeId: store.id }, data: { name, countries: JSON.stringify(countries) } });
  else await db.shippingZone.create({ data: { storeId: store.id, name, countries: JSON.stringify(countries), rates: { create: [{ name: "Standard", priceCents: store.shippingCents }] } } });
  await logActivity(`Zone d'expédition « ${name} » enregistrée`, "/admin/settings/shipping");
  refresh();
  return { ok: true };
}

export async function deleteZone(form: FormData) {
  const { store } = await requireOwner();
  await db.shippingZone.deleteMany({ where: { id: String(form.get("id")), storeId: store.id } });
  refresh();
}

export async function addRate(form: FormData) {
  const { store } = await requireOwner();
  const zone = await db.shippingZone.findFirst({ where: { id: String(form.get("zoneId")), storeId: store.id }, include: { _count: { select: { rates: true } } } });
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  const price = parseMoney(String(form.get("price") ?? ""));
  if (!zone || !name || price === null) return;
  const free = parseMoney(String(form.get("freeAbove") ?? ""));
  // Conditions facultatives : poids saisi en kg (gardé en grammes) et montant du panier.
  const kg = (k: string) => { const v = String(form.get(k) ?? "").trim().replace(",", "."); const n = Number(v); return v && Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) : null; };
  const money = (k: string) => { const v = String(form.get(k) ?? "").trim(); return v ? parseMoney(v) : null; };
  await db.shippingRate.create({
    data: {
      zoneId: zone.id, name, priceCents: price, freeAboveCents: free || null, position: zone._count.rates,
      minWeightGrams: kg("minWeight"), maxWeightGrams: kg("maxWeight"), minSubtotalCents: money("minSubtotal"), maxSubtotalCents: money("maxSubtotal"),
    },
  });
  refresh();
}

export async function deleteRate(form: FormData) {
  const { store } = await requireOwner();
  await db.shippingRate.deleteMany({ where: { id: String(form.get("id")), zone: { storeId: store.id } } });
  refresh();
}

export async function savePickup(form: FormData) {
  const { store } = await requireOwner();
  const enabled = form.get("enabled") === "on";
  const address = String(form.get("address") ?? "").trim().slice(0, 300);
  const instructions = String(form.get("instructions") ?? "").trim().slice(0, 500);
  await db.store.update({ where: { id: store.id }, data: { pickupEnabled: enabled && address.length > 0, pickupAddress: address, pickupInstructions: instructions } });
  await logActivity(`Retrait en boutique ${enabled && address ? "activé" : "désactivé"}`, "/admin/settings/shipping");
  revalidatePath("/admin/settings/shipping");
  revalidatePath(`/s/${store.slug}`, "layout");
}
