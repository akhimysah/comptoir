"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";

const TYPES = ["text", "multiline", "number", "boolean", "choice"] as const;
const parseChoices = (raw: string) => [...new Set(raw.split(/[\n,]/).map((x) => x.trim()).filter(Boolean))].slice(0, 50).map((x) => x.slice(0, 60));
const done = (slug: string, msg: string) => { revalidatePath("/admin/settings/custom-data"); revalidatePath(`/s/${slug}`, "layout"); redirect(`/admin/settings/custom-data?ok=${encodeURIComponent(msg)}`); };
const fail = (msg: string) => redirect(`/admin/settings/custom-data?err=${encodeURIComponent(msg)}`);

export async function createDefinition(form: FormData) {
  const { store } = await requireOwner();
  const name = String(form.get("name") ?? "").trim().slice(0, 40);
  const type = z.enum(TYPES).safeParse(form.get("type"));
  if (!name) fail("Donnez un nom au champ.");
  if (!type.success) fail("Type invalide.");
  const choices = parseChoices(String(form.get("choices") ?? ""));
  if (type.data === "choice" && choices.length < 2) fail("Indiquez au moins deux choix, un par ligne.");
  const base = slugify(name) || "champ";
  let key = base;
  for (let i = 2; await db.metafieldDefinition.findUnique({ where: { storeId_key: { storeId: store.id, key } } }); i++) key = `${base}-${i}`;
  const count = await db.metafieldDefinition.count({ where: { storeId: store.id } });
  if (count >= 30) fail("30 champs maximum.");
  await db.metafieldDefinition.create({
    data: { storeId: store.id, key, name, type: type.data!, choices: JSON.stringify(type.data === "choice" ? choices : []), unit: String(form.get("unit") ?? "").trim().slice(0, 10), filterable: form.get("filterable") === "on" && ["choice", "boolean", "text"].includes(type.data!), position: count },
  });
  await logActivity(`Champ personnalisé « ${name} » créé`, "/admin/settings/custom-data");
  done(store.slug, `Champ « ${name} » créé.`);
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
  done(store.slug, `Champ « ${name} » enregistré.`);
}

export async function deleteDefinition(form: FormData) {
  const { store } = await requireOwner();
  const d = await db.metafieldDefinition.findFirst({ where: { id: String(form.get("id")), storeId: store.id } });
  if (!d) fail("Champ introuvable.");
  await db.metafieldDefinition.delete({ where: { id: d!.id } });
  // Les valeurs déjà saisies sur les produits sont retirées.
  const products = await db.product.findMany({ where: { storeId: store.id, metafields: { contains: `"${d!.key}"` } }, select: { id: true, metafields: true } });
  for (const p of products) {
    const v = JSON.parse(p.metafields || "{}");
    delete v[d!.key];
    await db.product.update({ where: { id: p.id }, data: { metafields: JSON.stringify(v) } });
  }
  await logActivity(`Champ personnalisé « ${d!.name} » supprimé`, "/admin/settings/custom-data");
  done(store.slug, `Champ « ${d!.name} » supprimé.`);
}
