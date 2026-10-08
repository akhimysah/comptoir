import { requireStore } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import { centsToInput } from "@/lib/money";
import { FULFILLMENT_LABELS, PAYMENT_LABELS, type Address } from "@/lib/orders";
import { parseJson } from "@/lib/utils";

export async function GET() {
  const { store } = await requireStore();
  const orders = await db.order.findMany({ where: { storeId: store.id }, include: { items: true }, orderBy: { number: "desc" } });
  const eur = (c: number) => centsToInput(c).replace(".", ",");
  const rows: (string | number)[][] = [["Numéro", "Date", "Client", "E-mail", "Adresse", "Code postal", "Ville", "Pays", "Paiement", "Traitement", "Articles", "Sous-total", "Remise", "Code promo", "Livraison", "Total", "Annulée"]];
  for (const o of orders) {
    const a = parseJson<Address>(o.address, { line1: "", zip: "", city: "", country: "" });
    rows.push([
      o.number,
      o.createdAt.toLocaleString("fr-FR"),
      o.name, o.email, a.line1, a.zip, a.city, a.country,
      PAYMENT_LABELS[o.paymentStatus]?.label ?? o.paymentStatus,
      FULFILLMENT_LABELS[o.fulfillmentStatus]?.label ?? o.fulfillmentStatus,
      o.items.map((i) => `${i.quantity} × ${i.productTitle}${i.variantTitle !== "Par défaut" ? ` (${i.variantTitle})` : ""}`).join(" | "),
      eur(o.subtotalCents), eur(o.discountCents), o.discountCode ?? "", eur(o.shippingCents), eur(o.totalCents),
      o.cancelledAt ? "oui" : "non",
    ]);
  }
  return csvResponse(toCsv(rows), `commandes-${store.slug}.csv`);
}
