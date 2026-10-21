/** Géographie approximative : code pays ISO (en-tête de l'hébergeur) → nom français, et centre de chaque pays livrable. */
export const ALPHA2_TO_NAME: Record<string, string> = {
  FR: "France", BE: "Belgique", CH: "Suisse", LU: "Luxembourg", MC: "Monaco", DE: "Allemagne", ES: "Espagne", IT: "Italie", PT: "Portugal", NL: "Pays-Bas",
  BG: "Bulgarie", CY: "Chypre", HR: "Croatie", EE: "Estonie", FI: "Finlande", GR: "Grèce", HU: "Hongrie", LV: "Lettonie", LT: "Lituanie", MT: "Malte", CZ: "République tchèque", RO: "Roumanie", SK: "Slovaquie", SI: "Slovénie", YT: "Mayotte", GB: "Royaume-Uni", IE: "Irlande", AT: "Autriche", SE: "Suède", DK: "Danemark", PL: "Pologne", CA: "Canada", US: "États-Unis",
  MA: "Maroc", DZ: "Algérie", TN: "Tunisie", SN: "Sénégal", CI: "Côte d'Ivoire", CM: "Cameroun", RE: "La Réunion", GP: "Guadeloupe", MQ: "Martinique", GF: "Guyane",
  // Pays non livrés mais fréquents chez les visiteurs
  BR: "Brésil", MX: "Mexique", AR: "Argentine", CN: "Chine", JP: "Japon", KR: "Corée du Sud", IN: "Inde", AU: "Australie", NZ: "Nouvelle-Zélande", ZA: "Afrique du Sud", EG: "Égypte", NG: "Nigeria", TR: "Turquie", RU: "Russie", UA: "Ukraine", NO: "Norvège", IL: "Israël", AE: "Émirats arabes unis", SA: "Arabie saoudite", SG: "Singapour", TH: "Thaïlande", VN: "Viêt Nam", ID: "Indonésie", PH: "Philippines", CL: "Chili", CO: "Colombie", PE: "Pérou", MG: "Madagascar", ML: "Mali", BF: "Burkina Faso", GA: "Gabon", CD: "RD Congo", LB: "Liban", QA: "Qatar", RS: "Serbie", IS: "Islande",
};

/** Centre approximatif [longitude, latitude] : position de repli quand l'hébergeur ne donne que le pays, et position des commandes. */
export const COUNTRY_CENTER: Record<string, [number, number]> = {
  France: [2.2, 46.6], Belgique: [4.5, 50.6], Suisse: [8.2, 46.8], Luxembourg: [6.1, 49.8], Monaco: [7.42, 43.73], Allemagne: [10.4, 51.2], Espagne: [-3.7, 40.4], Italie: [12.6, 42.5], Portugal: [-8.2, 39.6], "Pays-Bas": [5.3, 52.2],
  Bulgarie: [25.5, 42.7], Chypre: [33.2, 35.1], Croatie: [16.2, 45.3], Estonie: [25.8, 58.7], Finlande: [26, 64], Grèce: [22, 39], Hongrie: [19.4, 47.2], Lettonie: [24.9, 56.9], Lituanie: [23.9, 55.3], Malte: [14.4, 35.9], "République tchèque": [15.5, 49.8], Roumanie: [25, 45.9], Slovaquie: [19.7, 48.7], Slovénie: [14.8, 46.1], Mayotte: [45.17, -12.83], "Royaume-Uni": [-2, 54], Irlande: [-8, 53.3], Autriche: [14.1, 47.6], Suède: [16.3, 62.4], Danemark: [10, 56.1], Pologne: [19.4, 52.1], Canada: [-96, 56], "États-Unis": [-98.5, 39.8],
  Maroc: [-6, 32], Algérie: [2.6, 28], Tunisie: [9.5, 34], Sénégal: [-14.5, 14.5], "Côte d'Ivoire": [-5.5, 7.5], Cameroun: [12.4, 5.7], "La Réunion": [55.53, -21.11], Guadeloupe: [-61.55, 16.25], Martinique: [-61.02, 14.64], Guyane: [-53.1, 3.9],
  Brésil: [-53, -10], Mexique: [-102, 23.6], Argentine: [-64, -34], Chine: [104, 35], Japon: [138, 36.5], "Corée du Sud": [127.8, 36.5], Inde: [78.9, 22], Australie: [134, -25], "Nouvelle-Zélande": [172, -41], "Afrique du Sud": [25, -29], Égypte: [30, 26.5], Nigeria: [8.5, 9.5], Turquie: [35.2, 39], Russie: [60, 60], Ukraine: [31.5, 49], Norvège: [9, 61], Israël: [34.9, 31.4], "Émirats arabes unis": [54, 24], "Arabie saoudite": [45, 24], Singapour: [103.8, 1.35], Thaïlande: [101, 15], "Viêt Nam": [107, 16], Indonésie: [118, -2], Philippines: [122, 12.5], Chili: [-71, -33], Colombie: [-74, 4.5], Pérou: [-76, -10], Madagascar: [47, -19], Mali: [-2, 17.5], "Burkina Faso": [-1.5, 12.3], Gabon: [11.6, -0.6], "RD Congo": [23.6, -2.9], Liban: [35.9, 33.9], Qatar: [51.2, 25.3], Serbie: [20.9, 44], Islande: [-18, 65],
};

/** Position approximative d'une requête d'après les en-têtes de l'hébergeur (Vercel, Cloudflare). Rien en local. */
export function requestGeo(headers: Headers): { country: string; city: string; lat: number | null; lng: number | null } {
  const code = (headers.get("x-vercel-ip-country") ?? headers.get("cf-ipcountry") ?? "").toUpperCase();
  const country = ALPHA2_TO_NAME[code] ?? (code && code !== "XX" ? code : "");
  const city = decodeURIComponent(headers.get("x-vercel-ip-city") ?? "").slice(0, 80);
  let lat = Number(headers.get("x-vercel-ip-latitude")), lng = Number(headers.get("x-vercel-ip-longitude"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (!lat && !lng)) {
    const c = COUNTRY_CENTER[country];
    if (!c) return { country, city, lat: null, lng: null };
    [lng, lat] = c;
  }
  return { country, city, lat, lng };
}
