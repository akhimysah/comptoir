"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { isMetafieldOwner, type MetafieldOwner } from "@/lib/metafields";

const TYPES = ["text", "multiline", "number", "boolean", "choice"] as const;
const parseChoices = (raw: string) => [...new Set(raw.split(/[\n,]/).map((x) => x.trim()).filter(Boolean))].slice(0, 50).map((x) => x.slice(0, 60));
const done = (slug: string, msg: string, owner: MetafieldOwner = "product") => { revalidatePath("/admin/settings/custom-data"); revalidatePath(`/s/${slug}`, "layout"); redirect(`/admin/settings/custom-data?owner=${owner}&ok=${encodeURIComponent(msg)}`); };
const fail = (msg: string, owner: MetafieldOwner = "product") => redirect(`/admin/settings/custom-data?owner=${owner}&err=${encodeURIComponent(msg)}`);

export async function createDefinition(form: FormData) {
  const { store } = await requireOwner();
  const owner: MetafieldOwner = isMetafieldOwner(form.get("owner")) ? form.get("owner") as MetafieldOwner : "product";
  const name = String(form.get("name") ?? "").trim().slice(0, 40);
  const type = z.enum(TYPES).safeParse(form.get("type"));
  if (!name) fail("Donnez un nom au champ.", owner);
  if (!type.success) fail("Type invalide.", owner);
  const choices = parseChoices(String(form.get("choices") ?? ""));
  if (type.data === "choice" && choices.length < 2) fail("Indiquez au moins deux choix, un par ligne.", owner);
  const base = slugify(name) || "champ";
  let key = base;
  for (let i = 2; await db.metafieldDefinition.findUnique({ where: { storeId_owner_key: { storeId: store.id, owner, key } } }); i++) key = `${base}-${i}`;
  const count = await db.metafieldDefinition.count({ where: { storeId: store.id, owner } });
  if (count >= 30) fail("30 champs maximum par type d'élément.", owner);
  await db.metafieldDefinition.create({
    data: { storeId: store.id, owner, key, name, type: type.data!, choices: JSON.stringify(type.data === "choice" ? choices : []), unit: String(form.get("unit") ?? "").trim().slice(0, 10), filterable: owner === "product" && form.get("filterable") === "on" && ["choice", "boolean", "text"].includes(type.data!), position: count },
  });
  await logActivity(`Champ personnalisé « ${name} » créé`, "/admin/settings/custom-data");
  done(store.slug, `Champ « ${name} » créé.`, owner);
}

export async function updateDefinition(form: FormData) {
  const { store } = await requireOwner();
  const d = await db.metafieldDefinition.findFirst({ where: { id: String(form.get("id")), storeId: store.id } });
  if (!d) fail("Champ introuvable.");
  const name = String(form.get("name") ?? "").trim().slice(0, 40) || d!.name;
  const choices = d!.type === "choice" ? parseChoices(String(form.get("choices") ?? "")) : [];
  if (d!.type === "choice" && choices.length < 2) fail("Indiquez au moins deux choix, un par ligne.");
  await db.metafieldDefinition.update({
    where: { id: d!.id },
    data: { name, unit: String(form.get("unit") ?? "").trim().slice(0, 10), choices: JSON.stringify(choices), showOnProduct: form.get("showOnProduct") === "on", filterable: form.get("filterable") === "on" && ["choice", "boolean", "text"].includes(d!.type) },
  });
  done(store.slug, `Champ « ${name} » enregistré.`, d!.owner as MetafieldOwner);
}

export async function deleteDefinition(form: FormData) {
  const { store } = await requireOwner();
  const d = await db.metafieldDefinition.findFirst({ where: { id: String(form.get("id")), storeId: store.id } });
  if (!d) fail("Champ introuvable.");
  await db.metafieldDefinition.delete({ where: { id: d!.id } });
  // Les valeurs déjà saisies sont retirées des éléments concernés.
  const strip = (raw: string) => { const v = JSON.parse(raw || "{}"); delete v[d!.key]; return JSON.stringify(v); };
  const where = { storeId: store.id, metafields: { contains: `"${d!.key}"` } };
  if (d!.owner === "product") for (const p of await db.product.findMany({ where, select: { id: true, metafields: true } })) await db.product.update({ where: { id: p.id }, data: { metafields: strip(p.metafields) } });
  if (d!.owner === "collection") for (const c of await db.collection.findMany({ where, select: { id: true, metafields: true } })) await db.collection.update({ where: { id: c.id }, data: { metafields: strip(c.metafields) } });
  if (d!.owner === "page") for (const pg of await db.page.findMany({ where, select: { id: true, metafields: true } })) await db.page.update({ where: { id: pg.id }, data: { metafields: strip(pg.metafields) } });
  if (d!.owner === "shop") await db.store.update({ where: { id: store.id }, data: { metafields: strip(store.metafields) } });
  await logActivity(`Champ personnalisé « ${d!.name} » supprimé`, "/admin/settings/custom-data");
  done(store.slug, `Champ « ${d!.name} » supprimé.`, d!.owner as MetafieldOwner);
}

/** Valeurs des champs de la boutique (shop.metafields dans les thèmes). */
export async function saveShopMetafields(form: FormData) {
  const { store } = await requireOwner();
  const defs = await db.metafieldDefinition.findMany({ where: { storeId: store.id, owner: "shop" } });
  const { cleanMetafields } = await import("@/lib/metafields");
  const input: Record<string, unknown> = {};
  for (const d of defs) input[d.key] = form.get(`mf_${d.key}`);
  const r = cleanMetafields(defs, input);
  if (r.error) fail(r.error, "shop");
  await db.store.update({ where: { id: store.id }, data: { metafields: JSON.stringify(r.values ?? {}) } });
  done(store.slug, "Champs de la boutique enregistrés.", "shop");
}
