"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { applySegment, customerStats, ruleSchema, SEGMENT_TEMPLATES, type Rule } from "@/lib/segments";

const segmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Donnez un nom au segment.").max(60),
  match: z.enum(["all", "any"]),
  rules: z.array(ruleSchema).max(15),
});

function checkValues(rules: Rule[]) {
  for (const r of rules) {
    if (["marketing"].includes(r.field) || r.op === "never") continue;
    if (["orders", "spent", "avg", "points", "lastOrder", "created"].includes(r.field) && !(r.value !== "" && Number(r.value) >= 0)) return "Indiquez un nombre pour chaque condition.";
    if (["tag", "product", "country"].includes(r.field) && !r.value) return "Complétez chaque condition.";
  }
  return null;
}

/** Aperçu en direct pendant l'édition : nombre de clients et premiers noms. */
export async function previewSegment(match: "all" | "any", rules: Rule[]) {
  const { store } = await requirePerm("customers");
  const parsed = z.array(ruleSchema).max(15).safeParse(rules);
  if (!parsed.success || checkValues(parsed.data)) return { count: null, sample: [] };
  const members = applySegment(await customerStats(store.id), match, parsed.data);
  return { count: members.length, sample: members.slice(0, 8).map((m) => ({ id: m.id, name: m.name, email: m.email })) };
}

export async function saveSegment(input: z.infer<typeof segmentSchema>): Promise<{ error?: string }> {
  const { store } = await requirePerm("customers");
  const parsed = segmentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const s = parsed.data;
  const bad = checkValues(s.rules);
  if (bad) return { error: bad };
  const data = { name: s.name, match: s.match, rules: JSON.stringify(s.rules) };
  let id = s.id;
  if (id) { const r = await db.segment.updateMany({ where: { id, storeId: store.id }, data }); if (!r.count) return { error: "Ce segment n'existe plus." }; }
  else id = (await db.segment.create({ data: { ...data, storeId: store.id } })).id;
  await logActivity(`Segment « ${s.name} » enregistré`, `/admin/customers/segments/${id}`);
  revalidatePath("/admin/customers", "layout");
  redirect(`/admin/customers?segment=${id}`);
}

export async function deleteSegment(form: FormData) {
  const { store } = await requirePerm("customers");
  const id = String(form.get("id"));
  const seg = await db.segment.findFirst({ where: { id, storeId: store.id } });
  if (seg) {
    await db.campaign.updateMany({ where: { storeId: store.id, segmentId: id, status: "draft" }, data: { segmentId: null } });
    await db.segment.delete({ where: { id } });
    await logActivity(`Segment « ${seg.name} » supprimé`, "/admin/customers/segments");
  }
  revalidatePath("/admin/customers", "layout");
  redirect("/admin/customers/segments");
}

export async function createFromTemplate(form: FormData) {
  const { store } = await requirePerm("customers");
  const t = SEGMENT_TEMPLATES[Number(form.get("index"))];
  if (!t) return;
  const seg = await db.segment.create({ data: { storeId: store.id, name: t.name, match: t.match, rules: JSON.stringify(t.rules) } });
  revalidatePath("/admin/customers", "layout");
  redirect(`/admin/customers/segments/${seg.id}`);
}
