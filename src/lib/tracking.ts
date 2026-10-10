/** Transporteurs courants et leur page de suivi ({n} = numéro de suivi). */
export const CARRIERS: Record<string, { label: string; url: string }> = {
  colissimo: { label: "Colissimo", url: "https://www.laposte.fr/outils/suivre-vos-envois?code={n}" },
  chronopost: { label: "Chronopost", url: "https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT={n}" },
  mondial_relay: { label: "Mondial Relay", url: "https://www.mondialrelay.fr/suivi-de-colis/?NumeroExpedition={n}" },
  lettre_suivie: { label: "Lettre suivie (La Poste)", url: "https://www.laposte.fr/outils/suivre-vos-envois?code={n}" },
  dpd: { label: "DPD", url: "https://trace.dpd.fr/fr/trace/{n}" },
  gls: { label: "GLS", url: "https://gls-group.com/FR/fr/suivi-colis?match={n}" },
  ups: { label: "UPS", url: "https://www.ups.com/track?loc=fr_FR&tracknum={n}" },
  dhl: { label: "DHL", url: "https://www.dhl.com/fr-fr/home/tracking.html?tracking-id={n}" },
  fedex: { label: "FedEx", url: "https://www.fedex.com/fedextrack/?trknbr={n}" },
  other: { label: "Autre transporteur", url: "" },
};

export const carrierLabel = (c: string) => (c === "other" ? "Transporteur" : CARRIERS[c]?.label ?? c);

/** Lien de suivi du colis, ou null s'il n'y a pas de numéro (ou pas d'adresse de suivi sûre). */
export function trackingLink(o: { trackingCarrier: string; trackingNumber: string; trackingUrl: string }) {
  if (!o.trackingNumber) return null;
  const tpl = CARRIERS[o.trackingCarrier]?.url;
  if (tpl) return tpl.replace("{n}", encodeURIComponent(o.trackingNumber));
  return /^https:\/\/[^\s]+$/i.test(o.trackingUrl) ? o.trackingUrl : null;
}
