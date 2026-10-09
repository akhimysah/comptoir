"use server";

import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { abandonedCartEmail } from "@/lib/emails";
import { sendMail } from "@/lib/mail";
import { priceCart, type CartInput } from "@/lib/pricing";
import { appUrl } from "@/lib/stripe";
import { parseJson } from "@/lib/utils";

export async function sendReminder(form: FormData) {
  const { store } = await requirePerm("orders");
  const c = await db.checkout.findFirst({ where: { id: String(form.get("id")), storeId: store.id, orderId: null } });
  if (!c) return;
  const cart = await priceCart(store, parseJson<CartInput>(c.items, []));
  if (!cart.lines.length) return;
  const link = `${appUrl()}/s/${store.slug}/cart?recover=${c.token}`;
  const lines = cart.lines.map((l) => ({ title: l.variantTitle === "Par défaut" ? l.productTitle : `${l.productTitle} (${l.variantTitle})`, quantity: l.quantity, priceCents: l.priceCents }));
  await sendMail({ to: c.email, storeId: store.id, ...abandonedCartEmail(store, c.name, lines, link) });
  await db.checkout.update({ where: { id: c.id }, data: { remindedAt: new Date() } });
  revalidatePath("/admin/checkouts");
}

export async function deleteCheckout(form: FormData) {
  const { store } = await requirePerm("orders");
  await db.checkout.deleteMany({ where: { id: String(form.get("id")), storeId: store.id } });
  revalidatePath("/admin/checkouts");
}
