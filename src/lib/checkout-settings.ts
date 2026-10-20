import { parseJson } from "./utils";

/**
 * Réglages du processus de paiement, des moyens de paiement manuels et des politiques de la boutique
 * (Paramètres › Page de paiement, Paiements, Politiques). Fonctions pures : utilisables côté client comme côté serveur.
 */

export type FieldMode = "hidden" | "optional" | "required";
export const FIELD_MODES: FieldMode[] = ["hidden", "optional", "required"];
export const fieldMode = (v: unknown, fallback: FieldMode): FieldMode => (FIELD_MODES.includes(v as FieldMode) ? (v as FieldMode) : fallback);

/** Ce que la vitrine doit savoir pour afficher le formulaire de commande. */
export type CheckoutSettings = {
  phone: FieldMode;
  company: FieldMode;
  address2: boolean;
  marketingPreselect: boolean;
  deliveryMinDays: number | null;
  deliveryMaxDays: number | null;
  fulfillmentDays: number;
  /** Moyens de paiement manuels activés (nom affiché, index dans la liste enregistrée). */
  manual: { index: number; key: ManualKey; name: string }[];
};

export function checkoutSettingsOf(store: { checkoutPhone: string; checkoutCompany: string; checkoutAddress2: boolean; marketingPreselect: boolean; deliveryMinDays: number | null; deliveryMaxDays: number | null; fulfillmentDays: number; manualPayments: string }): CheckoutSettings {
  return {
    phone: fieldMode(store.checkoutPhone, "optional"),
    company: fieldMode(store.checkoutCompany, "hidden"),
    address2: store.checkoutAddress2,
    marketingPreselect: store.marketingPreselect,
    deliveryMinDays: store.deliveryMinDays,
    deliveryMaxDays: store.deliveryMaxDays,
    fulfillmentDays: store.fulfillmentDays,
    manual: readManualPayments(store.manualPayments).map((m, index) => ({ index, key: m.key, name: m.name, enabled: m.enabled && Boolean(m.name) })).filter((m) => m.enabled).map(({ index, key, name }) => ({ index, key, name })),
  };
}

/* ---------- Numéro de commande ---------- */

/** Numéro tel que le client le voit : préfixe + numéro + suffixe (« #1001 » par défaut). */
export const orderNumber = (store: { orderPrefix?: string | null; orderSuffix?: string | null }, number: number) => `${store.orderPrefix ?? "#"}${number}${store.orderSuffix ?? ""}`;

/* ---------- Dates de livraison estimées ---------- */

/** Ajoute n jours ouvrés (lundi–vendredi) à une date, sans toucher l'heure. */
export function addBusinessDays(from: Date, n: number) {
  const d = new Date(from);
  let left = Math.max(0, Math.floor(n));
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left--;
  }
  return d;
}

/** Fenêtre de livraison estimée (préparation + transport), ou null si le marchand ne l'a pas renseignée. */
export function deliveryWindow(s: { deliveryMinDays: number | null; deliveryMaxDays: number | null; fulfillmentDays?: number }, now = new Date()) {
  if (s.deliveryMinDays == null || s.deliveryMaxDays == null) return null;
  const min = Math.max(0, s.deliveryMinDays), max = Math.max(min, s.deliveryMaxDays);
  const prep = Math.max(0, s.fulfillmentDays ?? 0);
  return { from: addBusinessDays(now, prep + min), to: addBusinessDays(now, prep + max) };
}

/* ---------- Moyens de paiement manuels ---------- */

export type ManualKey = "bank_transfer" | "cod" | "custom";
export type ManualPayment = { key: ManualKey; name: string; instructions: string; enabled: boolean };
export const MANUAL_DEFAULTS: Record<Exclude<ManualKey, "custom">, { name: string; instructions: string }> = {
  bank_transfer: { name: "Virement bancaire", instructions: "Merci d'effectuer un virement du montant total sur le compte suivant, en indiquant votre numéro de commande en référence :\nIBAN : [FR76 …]\nBIC : [XXXXXXXX]\nTitulaire : [Nom de la boutique]\nVotre commande sera expédiée dès réception du paiement." },
  cod: { name: "Paiement à la livraison", instructions: "Vous réglerez le montant total au livreur, en espèces ou par carte, à la remise de votre colis. Préparez l'appoint si possible." },
};
export const MAX_CUSTOM_PAYMENTS = 3;

export function readManualPayments(json: string | null | undefined): ManualPayment[] {
  const raw = parseJson<unknown>(json, []);
  if (!Array.isArray(raw)) return [];
  const out: ManualPayment[] = [];
  let customs = 0;
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const key = o.key === "bank_transfer" || o.key === "cod" || o.key === "custom" ? o.key : null;
    if (!key) continue;
    if (key !== "custom" && out.some((m) => m.key === key)) continue;
    if (key === "custom" && ++customs > MAX_CUSTOM_PAYMENTS) continue;
    out.push({ key, name: String(o.name ?? "").trim().slice(0, 60), instructions: String(o.instructions ?? "").trim().slice(0, 2000), enabled: Boolean(o.enabled) });
  }
  return out;
}

/** Moyen de paiement manuel choisi par le client (index dans la liste enregistrée), s'il est bien activé et nommé. */
export function manualPaymentAt(json: string | null | undefined, index: number | null | undefined) {
  if (index == null || !Number.isInteger(index)) return null;
  const m = readManualPayments(json)[index];
  return m && m.enabled && m.name ? m : null;
}

/* ---------- Politiques ---------- */

export const POLICY_KEYS = ["returns", "privacy", "terms", "shipping", "contact", "legal", "sale"] as const;
export type PolicyKey = (typeof POLICY_KEYS)[number];
export const isPolicyKey = (k: string): k is PolicyKey => (POLICY_KEYS as readonly string[]).includes(k);
export type Policy = { body: string; published: boolean };
export type Policies = Record<PolicyKey, Policy>;

export const POLICY_LABELS: Record<PolicyKey, { fr: string; en: string }> = {
  returns: { fr: "Politique de retour et de remboursement", en: "Refund policy" },
  privacy: { fr: "Politique de confidentialité", en: "Privacy policy" },
  terms: { fr: "Conditions de service", en: "Terms of service" },
  shipping: { fr: "Politique d'expédition", en: "Shipping policy" },
  contact: { fr: "Coordonnées", en: "Contact information" },
  legal: { fr: "Mention légale", en: "Legal notice" },
  sale: { fr: "Conditions de vente", en: "Terms of sale" },
};

export function readPolicies(json: string | null | undefined): Policies {
  const raw = parseJson<Record<string, unknown>>(json, {});
  const out = {} as Policies;
  for (const k of POLICY_KEYS) {
    const p = raw && typeof raw === "object" && raw[k] && typeof raw[k] === "object" ? (raw[k] as Record<string, unknown>) : null;
    out[k] = { body: String(p?.body ?? "").slice(0, 50_000), published: Boolean(p?.published) };
  }
  return out;
}

export const writePolicies = (p: Policies) => JSON.stringify(Object.fromEntries(POLICY_KEYS.map((k) => [k, { body: p[k].body, published: p[k].published }])));

const NOT_ADVICE = "Ce texte est un modèle générique fourni à titre indicatif : il ne constitue pas un conseil juridique. Complétez les éléments entre crochets et faites-le relire par un professionnel.";

/** Modèles en français, génériques, avec des [crochets] à compléter par le marchand. */
export function policyTemplate(key: PolicyKey, store: { name: string; legalName?: string; legalAddress?: string; siret?: string; vatNumber?: string; returnWindowDays?: number }) {
  const name = store.legalName || store.name;
  const days = store.returnWindowDays ?? 14;
  const T: Record<PolicyKey, string> = {
    returns: `Nous souhaitons que vous soyez entièrement satisfait de votre achat chez ${store.name}.

## Délai de rétractation
Vous disposez de ${days} jours à compter de la réception de votre commande pour nous retourner un article, sans avoir à justifier de motif. Les articles doivent être renvoyés dans leur état d'origine, non utilisés, avec leur emballage et leurs étiquettes.

## Comment faire une demande de retour
1. Contactez-nous à [adresse e-mail] en indiquant votre numéro de commande.
2. Nous vous communiquons l'adresse de retour et les instructions.
3. Expédiez le colis dans les 14 jours suivant votre demande. Les frais de retour sont [à votre charge / à notre charge].

## Remboursement
Dès réception et vérification des articles, nous procédons au remboursement sur le moyen de paiement utilisé lors de la commande, sous 14 jours au plus tard.

## Exclusions
Ne peuvent être retournés : les produits personnalisés, les produits périssables, les produits descellés ne pouvant être renvoyés pour des raisons d'hygiène, et les cartes cadeaux.

## Articles défectueux ou endommagés
Si vous recevez un article défectueux ou endommagé, contactez-nous dans les 48 heures à [adresse e-mail] avec des photos : nous le remplacerons ou vous rembourserons intégralement.

${NOT_ADVICE}`,
    privacy: `${name} (« nous ») respecte votre vie privée et s'engage à protéger vos données personnelles conformément au Règlement général sur la protection des données (RGPD).

## Données collectées
Lors d'une commande ou de la création d'un compte, nous collectons : nom, adresse e-mail, adresse de livraison et de facturation, numéro de téléphone (optionnel), historique des commandes. Les informations de paiement sont traitées par notre prestataire de paiement et ne transitent jamais par nos serveurs.

## Utilisation
Vos données servent à traiter et livrer vos commandes, à vous informer de leur suivi, à répondre à vos demandes et, avec votre accord, à vous envoyer nos nouveautés et offres.

## Partage
Vos données sont transmises uniquement aux prestataires nécessaires à l'exécution de la commande : transporteurs, prestataire de paiement, hébergeur. Nous ne vendons jamais vos données.

## Conservation
Les données de commande sont conservées [10 ans] pour répondre aux obligations comptables ; les données de compte jusqu'à sa suppression.

## Vos droits
Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, de portabilité et d'opposition. Pour l'exercer, écrivez à [adresse e-mail]. Vous pouvez aussi saisir la CNIL.

## Cookies
Notre site utilise des cookies indispensables à son fonctionnement (panier, connexion) et, avec votre accord, des cookies de mesure d'audience.

${NOT_ADVICE}`,
    terms: `En utilisant le site de ${store.name}, vous acceptez les présentes conditions.

## Utilisation du site
Le site est destiné à un usage personnel et non commercial. Vous vous engagez à fournir des informations exactes lors de vos commandes et à ne pas utiliser le site à des fins illicites.

## Compte client
Vous êtes responsable de la confidentialité de vos identifiants et des actions effectuées depuis votre compte.

## Propriété intellectuelle
L'ensemble des contenus du site (textes, photos, logos, visuels) est la propriété de ${name} ou de ses partenaires et ne peut être reproduit sans autorisation.

## Disponibilité
Nous nous efforçons de maintenir le site accessible en permanence, sans garantie d'absence d'interruption.

## Responsabilité
Notre responsabilité ne saurait être engagée pour un dommage indirect résultant de l'utilisation du site.

## Droit applicable
Les présentes conditions sont soumises au droit [français]. Tout litige sera porté devant les tribunaux compétents de [ville].

${NOT_ADVICE}`,
    shipping: `## Délais
Les commandes sont préparées sous [1 à 2] jours ouvrés. La livraison intervient ensuite sous [2 à 5] jours ouvrés en France métropolitaine et [5 à 10] jours ouvrés pour l'international.

## Frais de livraison
Les frais sont indiqués dans le panier avant validation de la commande. [La livraison est offerte à partir de XX €.]

## Transporteurs et suivi
Nous expédions avec [Colissimo / Mondial Relay / Chronopost]. Un numéro de suivi vous est envoyé par e-mail dès l'expédition.

## Zones desservies
Nous livrons en [France métropolitaine, Union européenne, …]. Pour toute autre destination, contactez-nous à [adresse e-mail].

## Colis endommagé ou perdu
En cas de colis endommagé, émettez des réserves auprès du livreur et contactez-nous dans les 48 heures. En cas de colis perdu, nous ouvrons une enquête auprès du transporteur et vous réexpédions ou vous remboursons.

${NOT_ADVICE}`,
    contact: `**${name}**
${store.legalAddress || "[Adresse postale]"}

E-mail : [adresse e-mail]
Téléphone : [numéro de téléphone] — du [lundi au vendredi, de 9 h à 18 h]

Nous répondons à toutes les demandes sous [48 heures] ouvrées.`,
    legal: `## Éditeur du site
${name}
${store.legalAddress || "[Adresse du siège]"}
${store.siret ? `SIRET : ${store.siret}` : "SIRET : [numéro]"}
${store.vatNumber ? `TVA intracommunautaire : ${store.vatNumber}` : "TVA intracommunautaire : [numéro ou « non applicable, art. 293 B du CGI »]"}
[Forme juridique et capital social, le cas échéant]
Directeur de la publication : [nom]
Contact : [adresse e-mail]

## Hébergement
Le site est hébergé par [nom de l'hébergeur], [adresse], [téléphone].

## Propriété intellectuelle
Tous les contenus du site sont protégés par le droit d'auteur. Toute reproduction sans autorisation est interdite.

${NOT_ADVICE}`,
    sale: `## Article 1 – Objet
Les présentes conditions régissent les ventes conclues sur le site de ${store.name}, édité par ${name}.

## Article 2 – Prix
Les prix sont indiqués en euros, toutes taxes comprises, hors frais de livraison. ${name} se réserve le droit de modifier ses prix à tout moment ; le prix applicable est celui en vigueur au moment de la commande.

## Article 3 – Commande
La commande est ferme dès validation du paiement. Un e-mail de confirmation récapitulant la commande vous est envoyé. Nous nous réservons le droit de refuser une commande anormale ou passée de mauvaise foi.

## Article 4 – Paiement
Le paiement s'effectue par carte bancaire via notre prestataire sécurisé [ou par virement / à la livraison lorsque l'option est proposée]. La commande est expédiée après encaissement.

## Article 5 – Livraison
Voir notre politique d'expédition. Les délais sont donnés à titre indicatif ; un retard ne donne pas droit à annulation sauf dépassement de 30 jours.

## Article 6 – Droit de rétractation
Conformément au Code de la consommation, vous disposez de ${days} jours à compter de la réception pour exercer votre droit de rétractation. Voir notre politique de retour.

## Article 7 – Garanties
Nos produits bénéficient de la garantie légale de conformité et de la garantie contre les vices cachés.

## Article 8 – Litiges
Les présentes conditions sont soumises au droit [français]. En cas de litige, une solution amiable sera recherchée ; vous pouvez recourir au médiateur de la consommation [nom et coordonnées].

${NOT_ADVICE}`,
  };
  return T[key];
}
