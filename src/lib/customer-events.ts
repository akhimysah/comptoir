import "server-only";
import { db } from "./db";

/**
 * Chronologie d'un client (comme sur Shopify) : chaque action de l'équipe sur sa fiche laisse une trace.
 * Types : comment (commentaire d'un employé), note, tags, tax, marketing, points, b2b, locale…
 * Ne bloque jamais l'action qui l'appelle.
 */
export async function addCustomerEvent(storeId: string, customerId: string, type: string, message: string) {
  try {
    await db.customerEvent.create({ data: { storeId, customerId, type: type.slice(0, 30), message: message.slice(0, 2000) } });
  } catch {}
}
