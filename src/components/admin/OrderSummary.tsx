/**
 * Petites règles d'affichage partagées par la liste et la fiche des commandes (audit Shopify) :
 * canal de vente, « Traiter avant le », statut et mode de livraison. Fonctions pures, sans base.
 */

type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "attention";

export const CHANNELS = { online: "Boutique en ligne", pos: "Point de vente", admin: "Admin" } as const;
export type Channel = keyof typeof CHANNELS;

/** Canal d'après le moyen de paiement : caisse, création dans l'admin, sinon boutique en ligne. */
export function orderChannel(o: { paymentMethod: string }): Channel {
  if (o.paymentMethod.startsWith("pos")) return "pos";
  if (o.paymentMethod === "manual" || o.paymentMethod === "terms") return "admin";
  return "online";
}
/** Moyens de paiement correspondant à un canal (pour filtrer en base). */
export const channelPaymentMethods = (c: Channel) => (c === "pos" ? ["pos_cash", "pos_card"] : c === "admin" ? ["manual", "terms"] : ["demo", "stripe"]);

/** Date limite de traitement : paiement + délai promis, pour une commande payée, non traitée et non annulée. */
export function fulfillByOf(o: { paidAt: Date | null; paymentStatus: string; fulfillmentStatus: string; cancelledAt: Date | null }, fulfillmentDays: number): Date | null {
  if (!o.paidAt || o.cancelledAt || o.fulfillmentStatus !== "unfulfilled" || !["paid", "partially_refunded"].includes(o.paymentStatus)) return null;
  return new Date(o.paidAt.getTime() + fulfillmentDays * 86_400_000);
}

/** « Aujourd'hui », « Demain », « 24 oct. » ou, en retard, « Il y a 4 jours » (en rouge). */
export function fulfillByLabel(d: Date, now = new Date()): { label: string; overdue: boolean } {
  const day = 86_400_000;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(d) - startOf(now)) / day);
  if (diff < 0) return { label: diff === -1 ? "Hier" : `Il y a ${-diff} jours`, overdue: true };
  if (diff === 0) return { label: "Aujourd'hui", overdue: false };
  if (diff === 1) return { label: "Demain", overdue: false };
  return { label: d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }), overdue: false };
}

/** Statut de la livraison affiché dans la liste (comme Shopify) : livrée, suivi ajouté, expédiée. */
export function deliveryStatus(o: { fulfillmentStatus: string; deliveredAt: Date | null; trackingNumber: string; deliveryMethod: string; cancelledAt: Date | null }): { label: string; tone: Tone } | null {
  if (o.cancelledAt || o.fulfillmentStatus !== "fulfilled") return null;
  if (o.deliveredAt) return { label: o.deliveryMethod === "pickup" ? "Récupérée" : "Livrée", tone: "ok" };
  if (o.deliveryMethod === "pickup") return { label: "Récupérée", tone: "ok" };
  if (o.trackingNumber) return { label: "Suivi ajouté", tone: "info" };
  return { label: "Expédiée", tone: "neutral" };
}

export const shippingModeLabel = (o: { deliveryMethod: string; shippingMethod: string }) => (o.deliveryMethod === "pickup" ? "Retrait en boutique" : o.shippingMethod || "Livraison standard");

/** Balises d'une commande : séparées par des virgules, dédoublonnées, en minuscules. */
export const splitOrderTags = (tags: string) => [...new Set(tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];
