"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { POLICY_KEYS, POLICY_LABELS, readPolicies, writePolicies, type Policies } from "@/lib/checkout-settings";

/** Politiques de la boutique (retours, confidentialité, CGV…) : texte et publication de chacune. */
export async function savePolicies(_: { error?: string; ok?: boolean } | undefined, form: FormData) {
  const { store } = await requireOwner();
  const current = readPolicies(store.policies);
  const next = {} as Policies;
  for (const k of POLICY_KEYS) {
    const body = String(form.get(`${k}_body`) ?? "").replace(/\r\n/g, "\n").trim().slice(0, 50_000);
    const published = form.get(`${k}_published`) === "on";
    if (published && body.length < 20) return { error: `« ${POLICY_LABELS[k].fr} » : rédigez le texte avant de le publier.` };
    next[k] = { body, published };
  }
  await db.store.update({ where: { id: store.id }, data: { policies: writePolicies(next) } });
  const changed = POLICY_KEYS.filter((k) => current[k].published !== next[k].published || current[k].body !== next[k].body);
  if (changed.length) await logActivity(`Politiques modifiées : ${changed.map((k) => POLICY_LABELS[k].fr).join(", ")}`, "/admin/settings/policies");
  revalidatePath("/admin/settings/policies");
  revalidatePath(`/s/${store.slug}`, "layout");
  return { ok: true };
}
