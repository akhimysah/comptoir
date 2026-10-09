"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { campaignEmail, unsubscribeUrl } from "@/lib/marketing";

const schema = z.object({
  id: z.string().optional(),
  subject: z.string().trim().min(1, "Donnez un objet à l'e-mail.").max(150),
  title: z.string().trim().max(150),
  body: z.string().max(20_000),
  buttonText: z.string().trim().max(40),
  productIds: z.array(z.string()).max(6),
});
export type CampaignPayload = z.infer<typeof schema>;

export async function saveCampaign(_: { error?: string; ok?: boolean } | undefined, form: FormData) {
  const { store } = await requirePerm("marketing");
  let raw: unknown = null;
  try { raw = JSON.parse(String(form.get("payload") ?? "")); } catch {}
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, productIds, ...c } = parsed.data;
  const data = { ...c, productIds: JSON.stringify(productIds) };
  if (id) {
    const r = await db.campaign.updateMany({ where: { id, storeId: store.id, status: "draft" }, data });
    if (!r.count) return { error: "Cette campagne a déjà été envoyée : elle ne peut plus être modifiée." };
    revalidatePath(`/admin/marketing/${id}`);
    return { ok: true };
  }
  const created = await db.campaign.create({ data: { ...data, storeId: store.id } });
  redirect(`/admin/marketing/${created.id}`);
}

export async function sendTest(form: FormData) {
  const { user, store } = await requirePerm("marketing");
  const c = await db.campaign.findFirst({ where: { id: String(form.get("id")), storeId: store.id } });
  if (!c) return;
  const mail = await campaignEmail(store, c, unsubscribeUrl(store.slug, "test"));
  await sendMail({ to: user.email, storeId: store.id, subject: `[Test] ${mail.subject}`, html: mail.html });
  redirect(`/admin/marketing/${c.id}?test=1`);
}

export async function sendCampaign(form: FormData) {
  const { store } = await requirePerm("marketing");
  const c = await db.campaign.findFirst({ where: { id: String(form.get("id")), storeId: store.id, status: "draft" } });
  if (!c) return;
  // On verrouille d'abord la campagne pour qu'un double clic ne l'envoie pas deux fois.
  const lock = await db.campaign.updateMany({ where: { id: c.id, status: "draft" }, data: { status: "sending" } });
  if (!lock.count) return;
  const subscribers = await db.customer.findMany({ where: { storeId: store.id, acceptsMarketing: true, marketingToken: { not: null } } });
  for (const s of subscribers) {
    const mail = await campaignEmail(store, c, unsubscribeUrl(store.slug, s.marketingToken!));
    await sendMail({ to: s.email, storeId: store.id, ...mail });
  }
  await db.campaign.update({ where: { id: c.id }, data: { status: "sent", sentAt: new Date(), recipients: subscribers.length } });
  await logActivity(`Campagne « ${c.subject} » envoyée à ${subscribers.length} abonné(s)`, `/admin/marketing/${c.id}`);
  revalidatePath("/admin/marketing");
  redirect(`/admin/marketing/${c.id}`);
}

export async function deleteCampaign(form: FormData) {
  const { store } = await requirePerm("marketing");
  await db.campaign.deleteMany({ where: { id: String(form.get("id")), storeId: store.id, status: "draft" } });
  redirect("/admin/marketing");
}
