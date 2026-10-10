/**
 * E-mails clients personnalisables (objet, titre, message d'introduction).
 * Le reste (articles, montants, boutons) est toujours généré automatiquement.
 * Variables : {{prenom}}, {{numero}}, {{boutique}}, {{montant}}.
 */
export type TemplateKey = "order_confirmation" | "shipping" | "pickup_ready" | "refund" | "invoice" | "abandoned_cart" | "review_request" | "return_approved";
export type TemplateText = { subject: string; title: string; intro: string };

export const TEMPLATES: Record<TemplateKey, { label: string; when: string; vars: string[]; defaults: TemplateText }> = {
  order_confirmation: {
    label: "Confirmation de commande", when: "Dès que la commande est payée.", vars: ["prenom", "numero", "boutique", "montant"],
    defaults: { subject: "Commande #{{numero}} confirmée", title: "Merci pour votre commande, {{prenom}} !", intro: "Nous préparons votre commande #{{numero}}. Vous recevrez un autre e-mail dès qu'elle sera expédiée." },
  },
  shipping: {
    label: "Expédition", when: "Quand vous traitez (expédiez) la commande.", vars: ["prenom", "numero", "boutique"],
    defaults: { subject: "Votre commande #{{numero}} est en route", title: "Votre commande a été expédiée", intro: "Bonne nouvelle : votre commande #{{numero}} a quitté nos mains et arrive bientôt." },
  },
  pickup_ready: {
    label: "Prête pour le retrait", when: "Quand une commande à retirer en boutique est prête.", vars: ["prenom", "numero", "boutique"],
    defaults: { subject: "Votre commande #{{numero}} est prête à être retirée", title: "Votre commande vous attend !", intro: "Bonne nouvelle : votre commande #{{numero}} est prête. Présentez ce numéro au moment du retrait." },
  },
  refund: {
    label: "Remboursement", when: "Après un remboursement.", vars: ["prenom", "numero", "boutique", "montant"],
    defaults: { subject: "Remboursement de {{montant}} pour votre commande #{{numero}}", title: "Votre remboursement est en route", intro: "Nous avons remboursé {{montant}} sur votre commande #{{numero}}. Selon votre banque, le montant apparaît sous 5 à 10 jours." },
  },
  invoice: {
    label: "Facture avec lien de paiement", when: "Quand vous envoyez une facture (sans message personnel).", vars: ["prenom", "numero", "boutique", "montant"],
    defaults: { subject: "Facture {{boutique}} : commande #{{numero}} ({{montant}})", title: "Votre commande #{{numero}}", intro: "Voici le récapitulatif de votre commande. Vous pouvez la régler en ligne en toute sécurité." },
  },
  abandoned_cart: {
    label: "Panier abandonné", when: "Relance d'un panier laissé sans commande.", vars: ["prenom", "boutique"],
    defaults: { subject: "Vous avez oublié quelque chose chez {{boutique}}", title: "{{prenom}}, votre panier vous attend", intro: "Vous avez laissé des articles dans votre panier. Nous les avons gardés pour vous." },
  },
  review_request: {
    label: "Demande d'avis", when: "Quelques jours après l'expédition.", vars: ["prenom", "boutique"],
    defaults: { subject: "Que pensez-vous de votre commande {{boutique}} ?", title: "{{prenom}}, votre avis compte", intro: "Votre commande est arrivée il y a quelques jours. Un mot sur vos articles aide d'autres clients à choisir, et nous aide à nous améliorer." },
  },
  return_approved: {
    label: "Retour accepté", when: "Quand vous acceptez une demande de retour.", vars: ["numero", "boutique"],
    defaults: { subject: "Votre retour pour la commande #{{numero}} est accepté", title: "Votre retour est accepté", intro: "Vous pouvez nous renvoyer les articles ci-dessous. Nous vous rembourserons dès leur réception." },
  },
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];

/**
 * Remplace {{variable}}. Une variable vide disparaît avec la virgule qui l'accompagne
 * (« {{prenom}}, votre panier » → « Votre panier »), sans toucher au reste de la ponctuation.
 */
export function fill(text: string, vars: Record<string, string>) {
  const out = text.replace(/(,\s*)?\{\{\s*(\w+)\s*\}\}(\s*,)?/g, (_m, pre: string | undefined, k: string, post: string | undefined) => {
    const v = vars[k]?.trim();
    return v ? `${pre ?? ""}${v}${post ?? ""}` : "";
  }).replace(/^\s+/, "");
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** Textes à utiliser : ceux de la boutique s'ils existent, sinon ceux d'origine. */
export function templateText(raw: string, key: TemplateKey): TemplateText {
  let custom: Partial<TemplateText> = {};
  try { custom = (JSON.parse(raw || "{}") as Record<string, Partial<TemplateText>>)[key] ?? {}; } catch {}
  const d = TEMPLATES[key].defaults;
  return { subject: custom.subject?.trim() || d.subject, title: custom.title?.trim() || d.title, intro: custom.intro?.trim() || d.intro };
}
