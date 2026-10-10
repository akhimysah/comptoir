"use server";

import { logActivity } from "@/lib/activity";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseMoney } from "@/lib/money";

const schema = z.object({
  method: z.enum(["code", "automatic"]),
  code: z.string().trim().toUpperCase().optional().default(""),
  title: z.string().trim().max(60).optional().default(""),
  type: z.enum(["percent", "fixed", "free_shipping", "bxgy"]),
  value: z.string(),
  minSubtotal: z.string().optional().default(""),
  usageLimit: z.string().optional().default(""),
  startsAt: z.string().optional().default(""),
  endsAt: z.string().optional().default(""),
  appliesTo: z.enum(["all", "collections", "products"]).optional().default("all"),
  targetIds: z.string().optional().default("[]"),
  buyQty: z.string().optional().default("0"),
  getQty: z.string().optional().default("0"),
  oncePerCustomer: z.string().optional(),
  combinesWithShipping: z.string().optional(),
});

export async function createDiscount(_: { error?: string; ok?: boolean } | undefined, form: FormData) {
  const { store } = await requirePerm("discounts");
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.method === "code" && !/^[A-Z0-9_-]{3,30}$/.test(d.code)) return { error: "Le code doit faire 3 à 30 caractères : lettres, chiffres, - ou _." };
  if (d.method === "automatic" && !d.title) return { error: "Donnez un nom à la remise automatique (affiché au client)." };
  const code = d.method === "code" ? d.code : `AUTO-${Date.now().toString(36).toUpperCase()}`;

  let value: number | null;
  if (d.type === "free_shipping") value = 0;
  else if (d.type === "percent" || d.type === "bxgy") {
    const n = Math.round(Number(d.value.replace(",", ".")));
    value = n >= 1 && n <= 100 ? n : null;
    if (value === null) return { error: "Le pourcentage doit être entre 1 et 100." };
  } else {
    value = parseMoney(d.value);
    if (!value) return { error: "Indiquez un montant de réduction." };
  }
  const limit = d.usageLimit ? Math.floor(Number(d.usageLimit)) : null;
  if (limit !== null && !(limit > 0)) return { error: "Le nombre d'utilisations doit être positif." };
  const endsAt = d.endsAt ? new Date(`${d.endsAt}T23:59:59`) : null;
  const startsAt = d.startsAt ? new Date(`${d.startsAt}T00:00:00`) : null;
  if ((startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime()))) return { error: "Date invalide." };
  if (startsAt && endsAt && endsAt < startsAt) return { error: "La date de fin est avant la date de début." };
  const buyQty = d.type === "bxgy" ? Math.floor(Number(d.buyQty)) : 0;
  const getQty = d.type === "bxgy" ? Math.floor(Number(d.getQty)) : 0;
  if (d.type === "bxgy" && !(buyQty >= 1 && buyQty <= 20 && getQty >= 1 && getQty <= 20)) return { error: "Indiquez combien d'articles acheter et obtenir (1 à 20)." };
  // Collections ou produits ciblés : seulement ceux de cette boutique.
  const appliesTo = d.type === "free_shipping" ? "all" : d.appliesTo;
  let targetIds: string[] = [];
  if (appliesTo !== "all") {
    let raw: unknown = [];
    try { raw = JSON.parse(d.targetIds); } catch {}
    const ids = z.array(z.string().max(40)).max(200).safeParse(raw);
    if (!ids.success || !ids.data.length) return { error: appliesTo === "collections" ? "Choisissez au moins une collection." : "Choisissez au moins un produit." };
    const found = appliesTo === "collections"
      ? await db.collection.findMany({ where: { storeId: store.id, id: { in: ids.data } }, select: { id: true } })
      : await db.product.findMany({ where: { storeId: store.id, id: { in: ids.data } }, select: { id: true } });
    targetIds = found.map((x) => x.id);
  }

  try {
    await db.discount.create({
      data: { storeId: store.id, code, automatic: d.method === "automatic", title: d.title, type: d.type, value, minSubtotalCents: parseMoney(d.minSubtotal) ?? 0, usageLimit: limit, endsAt, startsAt, appliesTo, targetIds: JSON.stringify(targetIds), buyQty, getQty, oncePerCustomer: d.method === "code" && d.oncePerCustomer === "on", combinesWithShipping: d.combinesWithShipping === "on" },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: `Le code ${code} existe déjà.` };
    throw e;
  }
  await logActivity(d.method === "automatic" ? `Remise automatique « ${d.title} » créée` : `Code promo ${code} créé`, "/admin/discounts");
  revalidatePath("/admin/discounts");
  return { ok: true };
}

export async function toggleDiscount(form: FormData) {
  const { store } = await requirePerm("discounts");
  const d = await db.discount.findFirst({ where: { id: String(form.get("id")), storeId: store.id } });
  if (d) await db.discount.update({ where: { id: d.id }, data: { active: !d.active } });
  revalidatePath("/admin/discounts");
}

export async function deleteDiscount(form: FormData) {
  const { store } = await requirePerm("discounts");
  await db.discount.deleteMany({ where: { id: String(form.get("id")), storeId: store.id } });
  revalidatePath("/admin/discounts");
}

/** Cumul avec une livraison offerte (ou, pour une livraison offerte, avec une remise sur les produits). */
export async function toggleCombine(form: FormData) {
  const { store } = await requirePerm("discounts");
  const d = await db.discount.findFirst({ where: { id: String(form.get("id")), storeId: store.id } });
  if (d) await db.discount.update({ where: { id: d.id }, data: { combinesWithShipping: !d.combinesWithShipping } });
  revalidatePath("/admin/discounts");
}
