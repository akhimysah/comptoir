"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { purchaseOrderEmail } from "@/lib/emails";
import { sendMail } from "@/lib/mail";
import { parseMoney } from "@/lib/money";
import { receiveItems, setDraftLines } from "@/lib/purchasing";

const schema = z.object({
  id: z.string().optional(),
  supplierId: z.string().nullable(),
  newSupplier: z.object({ name: z.string().trim().max(80), email: z.string().trim().max(120) }).nullable(),
  expectedAt: z.string().max(20),
  shipping: z.string().max(20),
  note: z.string().max(2000),
  lines: z.array(z.object({ variantId: z.string(), quantity: z.number().int().min(1, "Quantité invalide.").max(100_000), cost: z.string().max(20) })).max(200),
});
export type PurchaseOrderInput = z.infer<typeof schema>;

export async function savePurchaseOrder(input: PurchaseOrderInput): Promise<{ error?: string }> {
  const { store } = await requirePerm("products");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (!d.lines.length) return { error: "Ajoutez au moins un article." };
  const lines = [];
  for (const l of d.lines) {
    const c = l.cost.trim() ? parseMoney(l.cost) : 0;
    if (c === null || c < 0) return { error: "Coût invalide sur une ligne." };
    lines.push({ variantId: l.variantId, quantity: l.quantity, costCents: c });
  }
  const shippingCents = d.shipping.trim() ? parseMoney(d.shipping) : 0;
  if (shippingCents === null || shippingCents < 0) return { error: "Frais de port invalides." };
  const expectedAt = d.expectedAt ? new Date(`${d.expectedAt}T12:00:00`) : null;
  if (expectedAt && Number.isNaN(expectedAt.getTime())) return { error: "Date de livraison invalide." };

  let supplierId = d.supplierId;
  if (d.newSupplier?.name) {
    if (d.newSupplier.email && !z.string().email().safeParse(d.newSupplier.email).success) return { error: "E-mail du fournisseur invalide." };
    supplierId = (await db.supplier.create({ data: { storeId: store.id, name: d.newSupplier.name, email: d.newSupplier.email.toLowerCase() } })).id;
  } else if (supplierId && !(await db.supplier.findFirst({ where: { id: supplierId, storeId: store.id } }))) {
    return { error: "Fournisseur introuvable." };
  }

  const data = { supplierId, expectedAt, shippingCents, note: d.note.trim() };
  let id = d.id;
  if (id) {
    const r = await db.purchaseOrder.updateMany({ where: { id, storeId: store.id, status: "draft" }, data });
    if (!r.count) return { error: "Seul un brouillon peut être modifié." };
  } else {
    for (let attempt = 0; attempt < 5 && !id; attempt++) {
      const last = await db.purchaseOrder.findFirst({ where: { storeId: store.id }, orderBy: { number: "desc" }, select: { number: true } });
      try { id = (await db.purchaseOrder.create({ data: { ...data, storeId: store.id, number: (last?.number ?? 0) + 1 } })).id; } catch { /* numéro pris en même temps : on réessaie */ }
    }
    if (!id) return { error: "Impossible de créer le bon. Réessayez." };
  }
  await setDraftLines(store.id, id, lines);
  revalidatePath("/admin/products/purchase-orders");
  redirect(`/admin/products/purchase-orders/${id}?saved=1`);
}

async function ownPo(form: FormData) {
  const { user, store } = await requirePerm("products");
  const po = await db.purchaseOrder.findFirst({ where: { id: String(form.get("id")), storeId: store.id }, include: { items: true, supplier: true } });
  if (!po) throw new Error("Bon de commande introuvable.");
  return { user, store, po };
}

export async function markOrdered(form: FormData) {
  const { store, po } = await ownPo(form);
  if (po.status !== "draft" || !po.items.length) return;
  const r = await db.purchaseOrder.updateMany({ where: { id: po.id, status: "draft" }, data: { status: "ordered", orderedAt: new Date() } });
  if (!r.count) return;
  if (form.get("notify") === "on" && po.supplier?.email) await sendMail({ to: po.supplier.email, storeId: store.id, ...purchaseOrderEmail(store, po) });
  await logActivity(`Bon de commande n° ${po.number} passé${po.supplier ? ` chez ${po.supplier.name}` : ""}`, `/admin/products/purchase-orders/${po.id}`);
  revalidatePath(`/admin/products/purchase-orders/${po.id}`);
  revalidatePath("/admin/products/purchase-orders");
}

export async function receivePurchaseOrder(form: FormData) {
  const { store, po } = await ownPo(form);
  const lines = po.items.map((i) => ({ itemId: i.id, quantity: Number(form.get(`rec_${i.id}`) ?? 0) }));
  const res = await receiveItems(store.id, po.id, lines, form.get("updateCosts") === "on");
  if (res.error) redirect(`/admin/products/purchase-orders/${po.id}?err=${encodeURIComponent(res.error)}`);
  await logActivity(`${res.count} article(s) reçu(s) sur le bon n° ${po.number}`, `/admin/products/purchase-orders/${po.id}`);
  revalidatePath("/admin", "layout");
  redirect(`/admin/products/purchase-orders/${po.id}?received=${res.count}`);
}

export async function cancelPurchaseOrder(form: FormData) {
  const { po } = await ownPo(form);
  if (po.status === "draft") await db.purchaseOrder.delete({ where: { id: po.id } });
  else if (["ordered", "partial"].includes(po.status)) await db.purchaseOrder.update({ where: { id: po.id }, data: { status: "cancelled" } });
  await logActivity(`Bon de commande n° ${po.number} ${po.status === "draft" ? "supprimé" : "annulé"}`, "/admin/products/purchase-orders");
  revalidatePath("/admin/products/purchase-orders");
  redirect("/admin/products/purchase-orders");
}
