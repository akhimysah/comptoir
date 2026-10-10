import "server-only";
import { randomBytes } from "crypto";
import { db } from "./db";
import { invoiceEmail } from "./emails";
import { sendMail } from "./mail";
import { appUrl } from "./stripe";
import { storeBaseBySlug } from "./domains";

/** Une facture se paie en ligne tant que la commande est en attente de paiement et non annulée. */
export const invoicePayable = (o: { paymentStatus: string; cancelledAt: Date | null; totalCents: number }) => o.paymentStatus === "pending" && !o.cancelledAt && o.totalCents > 0;

/** Lien de paiement de la commande (créé une seule fois). */
export async function payLink(order: { id: string; payToken: string | null }, slug: string) {
  let token = order.payToken;
  if (!token) {
    token = randomBytes(18).toString("base64url");
    const r = await db.order.updateMany({ where: { id: order.id, payToken: null }, data: { payToken: token } });
    if (!r.count) token = (await db.order.findUniqueOrThrow({ where: { id: order.id } })).payToken!;
  }
  return `${await storeBaseBySlug(slug)}/pay/${token}`;
}

/** Envoie la facture par e-mail avec le lien de paiement. */
export async function sendInvoice(storeId: string, orderId: string, author: string, message = ""): Promise<{ error?: string; link?: string }> {
  const order = await db.order.findFirst({ where: { id: orderId, storeId }, include: { items: true, store: true } });
  if (!order) return { error: "Commande introuvable." };
  if (!invoicePayable(order)) return { error: "Cette commande n'est plus en attente de paiement." };
  const link = await payLink(order, order.store.slug);
  await sendMail({ to: order.email, storeId, ...invoiceEmail(order.store, order, link, message.trim().slice(0, 1000)) });
  await db.order.update({ where: { id: order.id }, data: { invoiceSentAt: new Date() } });
  await db.orderEvent.create({ data: { orderId: order.id, type: "invoice_sent", author, message: order.email } });
  return { link };
}
