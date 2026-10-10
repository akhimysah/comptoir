/**
 * Informations légales de la plateforme, à renseigner dans le fichier .env avant la mise en ligne.
 * Tant qu'elles manquent, les pages légales affichent « [à compléter] » bien visiblement.
 */
const v = (key: string, label: string) => process.env[key]?.trim() || `[${label} à compléter]`;

export const platform = {
  name: "Parnassa Pay",
  company: v("PLATFORM_COMPANY", "Raison sociale"),
  legalForm: v("PLATFORM_LEGAL_FORM", "Forme juridique et capital"),
  address: v("PLATFORM_ADDRESS", "Adresse du siège"),
  siren: v("PLATFORM_SIREN", "SIREN / RCS"),
  vat: v("PLATFORM_VAT", "N° de TVA intracommunautaire"),
  director: v("PLATFORM_DIRECTOR", "Directeur de la publication"),
  email: v("PLATFORM_CONTACT_EMAIL", "E-mail de contact"),
  host: v("PLATFORM_HOST", "Hébergeur (nom, adresse, téléphone)"),
  /** Pages validées par un professionnel du droit : le bandeau « brouillon » disparaît. */
  legalValidated: process.env.LEGAL_VALIDATED === "1",
  feePercent: Math.max(0, Math.min(50, Number(process.env.PLATFORM_FEE_PERCENT ?? "2") || 0)),
};
