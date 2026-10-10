export const COUNTRIES = [
  "France", "Belgique", "Suisse", "Luxembourg", "Monaco", "Allemagne", "Espagne", "Italie", "Portugal", "Pays-Bas",
  "Bulgarie", "Chypre", "Croatie", "Estonie", "Finlande", "Grèce", "Hongrie", "Lettonie", "Lituanie", "Malte", "République tchèque", "Roumanie", "Slovaquie", "Slovénie", "Mayotte", "Royaume-Uni", "Irlande", "Autriche", "Suède", "Danemark", "Pologne", "Canada", "États-Unis",
  "Maroc", "Algérie", "Tunisie", "Sénégal", "Côte d'Ivoire", "Cameroun", "La Réunion", "Guadeloupe", "Martinique", "Guyane",
] as const;

/** Nom anglais des pays (affichage seulement : la valeur enregistrée reste le nom français). */
const COUNTRY_EN: Record<string, string> = {
  France: "France", Belgique: "Belgium", Suisse: "Switzerland", Luxembourg: "Luxembourg", Monaco: "Monaco", Allemagne: "Germany", Espagne: "Spain", Italie: "Italy", Portugal: "Portugal", "Pays-Bas": "Netherlands",
  Bulgarie: "Bulgaria", Chypre: "Cyprus", Croatie: "Croatia", Estonie: "Estonia", Finlande: "Finland", Grèce: "Greece", Hongrie: "Hungary", Lettonie: "Latvia", Lituanie: "Lithuania", Malte: "Malta", "République tchèque": "Czech Republic", Roumanie: "Romania", Slovaquie: "Slovakia", Slovénie: "Slovenia", Mayotte: "Mayotte", "Royaume-Uni": "United Kingdom", Irlande: "Ireland", Autriche: "Austria", Suède: "Sweden", Danemark: "Denmark", Pologne: "Poland", Canada: "Canada", "États-Unis": "United States",
  Maroc: "Morocco", Algérie: "Algeria", Tunisie: "Tunisia", Sénégal: "Senegal", "Côte d'Ivoire": "Côte d'Ivoire", Cameroun: "Cameroon", "La Réunion": "Réunion", Guadeloupe: "Guadeloupe", Martinique: "Martinique", Guyane: "French Guiana",
};
export const countryLabel = (name: string, locale: "fr" | "en") => (locale === "en" ? COUNTRY_EN[name] ?? name : name);
