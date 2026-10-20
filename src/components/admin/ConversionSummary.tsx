import type { Order } from "@prisma/client";
import { channelOf } from "@/lib/traffic";

/** « Voir les détails de la conversion » (fiche commande) : d'où venait le client et combien de visites avant l'achat. */
export function ConversionSummary({ order, orderCount }: { order: Pick<Order, "referrer" | "utmSource" | "utmMedium" | "utmCampaign" | "visitsBefore" | "sessionId">; orderCount: number }) {
  const known = Boolean(order.sessionId);
  return (
    <div className="flex flex-col gap-1 text-[13px]">
      <div>{orderCount <= 1 ? "Il s'agit de sa 1ʳᵉ commande." : `C'est sa ${orderCount}ᵉ commande.`}</div>
      {known ? (
        <>
          <div className="text-muted">Visite venue de : <span className="text-ink">{channelOf(order)}</span>{order.utmCampaign ? ` · campagne « ${order.utmCampaign} »` : ""}</div>
          {order.visitsBefore !== null && <div className="text-muted">{order.visitsBefore} visite{order.visitsBefore > 1 ? "s" : ""} avant la commande</div>}
          {order.referrer && <div className="truncate text-xs text-muted" title={order.referrer}>{order.referrer}</div>}
        </>
      ) : (
        <div className="text-muted">Origine de la visite inconnue (commande créée dans l'admin, en caisse, ou visite non mesurée).</div>
      )}
    </div>
  );
}
