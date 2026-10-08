"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStore } from "@/lib/auth";
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
});

export async function processRefund(input: z.infer<typeof schema>): Promise<{ error?: string }> {
  const { user, store } = await requireStore();
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
  redirect(`/admin/orders/${d.orderId}`);
}
