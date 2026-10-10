"use server";

import type { Order, OrderItem, Store } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { TEMPLATE_KEYS, TEMPLATES, type TemplateKey } from "@/lib/email-templates";
import { abandonedCartEmail, invoiceEmail, orderConfirmationEmail, pickupReadyEmail, refundEmail, returnApprovedEmail, reviewRequestEmail, shippingEmail } from "@/lib/emails";

const textSchema = z.object({ subject: z.string().max(150), title: z.string().max(150), intro: z.string().max(2000) });
const keySchema = z.enum(TEMPLATE_KEYS as [TemplateKey, ...TemplateKey[]]);

/** Commande d'exemple pour l'aperçu (rien n'est enregistré). */
function sample(store: Store) {
  const now = new Date();
  const items = [
    { id: "a", orderId: "x", variantId: null, productTitle: "Bol Céladon", variantTitle: "Par défaut", priceCents: 2800, quantity: 2, image: null, hue: 160, refundedQuantity: 0, isGiftCard: false, subscriptionInterval: null, costCents: null },
    { id: "b", orderId: "x", variantId: null, productTitle: "Tablier d'atelier", variantTitle: "M / Encre", priceCents: 3900, quantity: 1, image: null, hue: 10, refundedQuantity: 0, isGiftCard: false, subscriptionInterval: null, costCents: null },
  ] as OrderItem[];
  const order = {
    id: "exemple", storeId: store.id, number: 1042, name: "Camille Martin", email: "camille@exemple.fr", address: JSON.stringify({ line1: "8 rue des Lilas", zip: "69003", city: "Lyon", country: "France" }),
    subtotalCents: 9500, discountCents: 0, discountCode: null, shippingCents: 490, giftCardCents: 0, giftCardCode: null, totalCents: 9990, taxCents: 1665, taxRateBps: 2000,
    trackingCarrier: "colissimo", trackingNumber: "6A12345678901", trackingUrl: "", deliveryMethod: "shipping", createdAt: now, items,
  } as unknown as Order & { items: OrderItem[] };
  return order;
}

function render(store: Store, key: TemplateKey) {
  const o = sample(store);
  const link = `/s/${store.slug}`;
  switch (key) {
    case "order_confirmation": return orderConfirmationEmail(store, o);
    case "shipping": return shippingEmail(store, o);
    case "pickup_ready": return pickupReadyEmail(store, { ...o, deliveryMethod: "pickup" } as typeof o);
    case "refund": return refundEmail(store, o.number, 2800, [{ title: "Bol Céladon", quantity: 1 }], "Article arrivé abîmé");
    case "invoice": return invoiceEmail(store, o, link, "");
    case "abandoned_cart": return abandonedCartEmail(store, o.name, o.items.map((i) => ({ title: i.productTitle, quantity: i.quantity, priceCents: i.priceCents })), link);
    case "review_request": return reviewRequestEmail(store, o.name, [{ title: "Bol Céladon", url: link }, { title: "Tablier d'atelier", url: link }]);
    case "return_approved": return returnApprovedEmail(store, o.number, [{ title: "Bol Céladon", quantity: 1, reason: "Article défectueux ou abîmé" }]);
  }
}

/** Aperçu avec les textes en cours de saisie (non enregistrés). */
export async function previewTemplate(key: string, text: z.infer<typeof textSchema>) {
  const { store } = await requireOwner();
  const k = keySchema.parse(key);
  const t = textSchema.parse(text);
  const draft = { ...JSON.parse(store.emailTemplates || "{}"), [k]: t };
  const mail = render({ ...store, emailTemplates: JSON.stringify(draft) }, k);
  return { subject: mail.subject, html: mail.html };
}

export async function saveTemplate(key: string, text: z.infer<typeof textSchema> | null): Promise<{ ok?: boolean; error?: string }> {
  const { store } = await requireOwner();
  const k = keySchema.safeParse(key);
  if (!k.success) return { error: "Modèle inconnu." };
  const all: Record<string, unknown> = JSON.parse(store.emailTemplates || "{}");
  if (text === null) delete all[k.data];
  else {
    const t = textSchema.safeParse(text);
    if (!t.success) return { error: "Texte trop long." };
    const d = TEMPLATES[k.data].defaults;
    // Seuls les champs modifiés sont gardés : les autres suivent le texte d'origine.
    all[k.data] = { subject: t.data.subject.trim() === d.subject ? "" : t.data.subject.trim(), title: t.data.title.trim() === d.title ? "" : t.data.title.trim(), intro: t.data.intro.trim() === d.intro ? "" : t.data.intro.trim() };
  }
  await db.store.update({ where: { id: store.id }, data: { emailTemplates: JSON.stringify(all) } });
  await logActivity(`E-mail « ${TEMPLATES[k.data].label} » ${text === null ? "rétabli" : "personnalisé"}`, "/admin/settings/notifications");
  revalidatePath("/admin/settings/notifications");
  return { ok: true };
}
