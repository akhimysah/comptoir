"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requirePerm } from "@/lib/auth";
import { sendInvoice } from "@/lib/invoices";
import { parseMoney } from "@/lib/money";
import { editPendingOrder } from "@/lib/order-edit";

const schema = z.object({
  orderId: z.string(),
  lines: z.array(z.object({ itemId: z.string().optional(), variantId: z.string().optional(), quantity: z.number().int().min(0).max(9999) })).max(200),
  shipping: z.string().max(20),
  resend: z.boolean(),
});

export async function saveOrderEdit(input: z.infer<typeof schema>): Promise<{ error?: string }> {
  const { user, store } = await requirePerm("orders");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Modification invalide." };
  const d = parsed.data;
  const shipping = parseMoney(d.shipping || "0");
  if (shipping === null) return { error: "Frais de livraison invalides." };
  const res = await editPendingOrder(store.id, d.orderId, d.lines, shipping, user.name);
  if (res.error) return res;
  if (d.resend) await sendInvoice(store.id, d.orderId, user.name, "Votre commande a été mise à jour : voici le nouveau montant.");
  await logActivity(`Commande modifiée (${res.summary})`, `/admin/orders/${d.orderId}`);
  revalidatePath(`/admin/orders/${d.orderId}`);
  redirect(`/admin/orders/${d.orderId}`);
}
