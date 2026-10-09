"use server";

import { logActivity } from "@/lib/activity";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseMoney } from "@/lib/money";
import { refundOrder } from "@/lib/refunds";

const schema = z.object({
  orderId: z.string(),
  lines: z.array(z.object({ orderItemId: z.string(), quantity: z.number().int().min(0) })),
  shipping: z.string(),
  amount: z.string(),
  restock: z.boolean(),
  notify: z.boolean(),
  reason: z.string().max(300),
  returnId: z.string().optional(),
});

export async function processRefund(input: z.infer<typeof schema>): Promise<{ error?: string }> {
  const { user, store } = await requirePerm("orders");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Formulaire invalide." };
  const d = parsed.data;
  const amount = parseMoney(d.amount);
  if (amount === null) return { error: "Montant invalide." };
  const res = await refundOrder({
    orderId: d.orderId, storeId: store.id, author: user.name, lines: d.lines, shippingCents: parseMoney(d.shipping) ?? 0,
    amountCents: amount, restock: d.restock, notify: d.notify, reason: d.reason.trim(),
  });
  if (res.error) return res;
  // Remboursement lancé depuis un retour : le retour est clos.
  if (d.returnId) {
    const closed = await db.returnRequest.updateMany({ where: { id: d.returnId, storeId: store.id, orderId: d.orderId, status: { in: ["approved", "received"] } }, data: { status: "refunded", closedAt: new Date() } });
    if (closed.count) await db.orderEvent.create({ data: { orderId: d.orderId, type: "return_refunded", author: user.name, message: "" } });
  }
  await logActivity(`Remboursement de ${d.amount.replace(".", ",")} ${store.currency}`, `/admin/orders/${d.orderId}`);
  redirect(`/admin/orders/${d.orderId}`);
}
