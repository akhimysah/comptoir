/**
 * Polices : les réglages `font_picker` de Shopify sont des identifiants ("inter_n7", "din_next_n4") qui
 * désignent des polices servies par le CDN Shopify. Nous n'y avons pas accès : on les traduit en polices
 * Google Fonts (identiques quand elles y existent, proches sinon) chargées via une balise <link> injectée dans <head>.
 */
import { Drop } from "liquidjs";

/** Familles disponibles sur Google Fonts (clé : nom normalisé en minuscules sans espaces). */
const GOOGLE = [
  "Inter", "DM Sans", "Manrope", "Poppins", "Montserrat", "Lato", "Roboto", "Open Sans", "Playfair Display", "Work Sans", "Nunito", "Nunito Sans", "Raleway",
  "Oswald", "Source Sans 3", "Josefin Sans", "Fraunces", "Cormorant Garamond", "Syne", "Space Grotesk", "Figtree", "Jost", "Outfit", "Karla", "Rubik", "Archivo",
  "Libre Baskerville", "Lora", "Merriweather", "Assistant", "Quicksand", "Mulish", "Barlow", "Cabin", "Chivo", "Heebo", "Hind", "IBM Plex Sans", "IBM Plex Mono",
  "Inconsolata", "Kanit", "Lexend", "Noto Sans", "Noto Serif", "Oxygen", "Prompt", "PT Sans", "PT Serif", "Questrial", "Sora", "Titillium Web", "Urbanist",
  "Varela Round", "Vollkorn", "Yantramanav", "EB Garamond", "Bodoni Moda", "Abril Fatface", "Alegreya", "Alegreya Sans", "Anton", "Archivo Narrow", "Arimo",
  "Arvo", "Asap", "Bebas Neue", "Bitter", "Cardo", "Catamaran", "Crimson Text", "Dosis", "Exo 2", "Fira Sans", "Fjalla One", "Instrument Sans", "Italiana",
  "Libre Franklin", "Lobster", "Maven Pro", "Muli", "Old Standard TT", "Overpass", "Pacifico", "Plus Jakarta Sans", "Prata", "Red Hat Display", "Righteous",
  "Roboto Condensed", "Roboto Mono", "Roboto Slab", "Sacramento", "Shippori Mincho", "Spectral", "Tenor Sans", "Tinos", "Ubuntu", "Unica One", "Zilla Slab",
  "Cormorant", "Albert Sans", "Be Vietnam Pro", "Bricolage Grotesque", "Hanken Grotesk", "Onest", "Schibsted Grotesk", "Epilogue", "Gothic A1", "Public Sans",
  "Sen", "Signika", "Spline Sans", "Teko", "Alata", "Antonio", "Balsamiq Sans", "Cinzel", "Comfortaa", "Courier Prime", "Crimson Pro", "Domine", "Glegoo",
  "Judson", "Kalam", "Quantico", "Michroma", "Kreon", "Lusitana", "Marcellus", "Newsreader", "Nobile", "Noticia Text", "Ovo", "Oxygen Mono", "Philosopher", "Poiret One",
  "Quattrocento", "Quattrocento Sans", "Radley", "Rajdhani", "Rokkitt", "Rosario", "Sanchez", "Slabo 27px", "Source Code Pro", "Source Serif 4", "Volkhov",
  "Yeseva One", "Young Serif", "Abel", "Alice", "Amiri", "Average", "Cantarell", "Didact Gothic", "Forum", "Gentium Book Plus", "Hind Siliguri", "Jura",
  "Libre Caslon Text", "Mukta", "Neuton", "News Cycle", "Nixie One", "Oranienbaum", "Playfair Display SC", "Ropa Sans", "Rufina", "Sarabun", "Trirong",
  "Unna", "Varela", "Vidaloka", "Geologica", "Golos Text", "Instrument Serif", "Literata", "Mona Sans", "Hubot Sans", "Familjen Grotesk",
];
const GOOGLE_BY_KEY = new Map(GOOGLE.map((f) => [f.toLowerCase().replace(/[^a-z0-9]/g, ""), f]));

/** Polices propriétaires du CDN Shopify → équivalent Google proche (ou famille système). */
const PROPRIETARY: Record<string, { family: string; system?: boolean; fallback?: string }> = {
  din_next: { family: "Barlow" }, futura: { family: "Jost" }, century_gothic: { family: "Questrial" }, helvetica: { family: "Inter" }, neue_haas_unica: { family: "Inter" },
  neue_haas_grotesk: { family: "Inter" }, zurich_extended: { family: "Archivo" }, zurich: { family: "Archivo" }, neuzeit_grotesk: { family: "Nunito Sans" }, avenir_next: { family: "Nunito Sans" },
  avenir: { family: "Nunito Sans" }, proxima_nova: { family: "Montserrat" }, gotham: { family: "Montserrat" }, akzidenz_grotesk: { family: "Inter" }, univers_next: { family: "Inter" },
  univers: { family: "Inter" }, garamond: { family: "EB Garamond" }, itc_garamond: { family: "EB Garamond" }, bodoni: { family: "Bodoni Moda" }, bodoni_moda: { family: "Bodoni Moda" },
  baskerville: { family: "Libre Baskerville" }, baskerville_no_2: { family: "Libre Baskerville" }, georgia: { family: "Georgia", system: true, fallback: "serif" },
  arial: { family: "Arial", system: true, fallback: "sans-serif" }, times_new_roman: { family: "Times New Roman", system: true, fallback: "serif" },
  courier_new: { family: "Courier New", system: true, fallback: "monospace" }, mono: { family: "IBM Plex Mono", fallback: "monospace" }, system: { family: "system-ui", system: true, fallback: "sans-serif" },
  helvetica_neue: { family: "Inter" }, trade_gothic: { family: "Archivo Narrow" }, trade_gothic_next: { family: "Archivo Narrow" }, frutiger: { family: "Hind" }, optima: { family: "Marcellus" },
  gill_sans: { family: "Cabin" }, franklin_gothic: { family: "Libre Franklin" }, itc_franklin_gothic: { family: "Libre Franklin" }, benton_sans: { family: "Public Sans" },
  sabon: { family: "Crimson Pro" }, minion: { family: "Crimson Pro" }, caslon: { family: "Libre Caslon Text" }, didot: { family: "Bodoni Moda" }, clarendon: { family: "Zilla Slab" },
  rockwell: { family: "Rokkitt" }, bauhaus: { family: "Righteous" }, eurostile: { family: "Michroma" }, american_typewriter: { family: "Courier Prime" }, tiempos: { family: "Newsreader" },
  harmonia_sans: { family: "Nunito Sans" }, agenda: { family: "Jost" }, aktiv_grotesk: { family: "Inter" }, fira: { family: "Fira Sans" }, lucida_grande: { family: "Lucida Grande", system: true, fallback: "sans-serif" },
  swiss_721: { family: "Inter" }, itc_johnston: { family: "Jost" }, johnston: { family: "Jost" }, itc_berkeley_old_style: { family: "Cardo" }, berkeley: { family: "Cardo" },
  din_neuzeit_grotesk: { family: "Nunito Sans" }, neuzeit_office: { family: "Nunito" }, neuzeit: { family: "Nunito Sans" }, itc_avant_garde: { family: "Questrial" }, avant_garde: { family: "Questrial" },
  source_sans_pro: { family: "Source Sans 3" }, source_serif_pro: { family: "Source Serif 4" }, itc_galliard: { family: "Crimson Pro" }, bembo: { family: "Libre Caslon Text" }, perpetua: { family: "Cormorant Garamond" },
  verdana: { family: "Verdana", system: true, fallback: "sans-serif" }, tahoma: { family: "Tahoma", system: true, fallback: "sans-serif" }, trebuchet_ms: { family: "Trebuchet MS", system: true, fallback: "sans-serif" },
  palatino: { family: "Palatino", system: true, fallback: "serif" }, monaco: { family: "Monaco", system: true, fallback: "monospace" }, menlo: { family: "Menlo", system: true, fallback: "monospace" },
};

const SERIF_HINT = /garamond|baskerville|bodoni|serif|playfair|lora|merriweather|cormorant|fraunces|vollkorn|libre|crimson|spectral|prata|cardo|tinos|domine|alegreya$|newsreader|literata|caslon|didot|georgia|times|palatino|minion|sabon|tiempos/i;

/** Police Shopify : `settings.type_header_font` → { family, fallback_families, weight, style, system, variants } ; affichée comme sa famille. */
export class FontDrop extends Drop {
  readonly family: string;
  readonly fallback_families: string;
  readonly weight: number;
  readonly style: string;
  readonly system: boolean;
  /** Famille Google à charger (identique à `family` sauf police système). */
  readonly google: string | null;
  readonly handle: string;
  constructor(init: { family: string; weight: number; style: string; system: boolean; google: string | null; fallback: string; handle: string }) {
    super();
    this.family = init.family;
    this.weight = init.weight;
    this.style = init.style;
    this.system = init.system;
    this.google = init.google;
    this.fallback_families = init.fallback;
    this.handle = init.handle;
  }
  /** Déclinaisons « disponibles » : toutes les graisses usuelles (Google les sert à la demande). */
  get variants(): FontDrop[] {
    return [400, 700].flatMap((w) => ["normal", "italic"].map((s) => this.modify({ weight: w, style: s })));
  }
  get baseline_ratio() { return 0.1; }
  modify(patch: { weight?: number; style?: string }): FontDrop {
    return new FontDrop({ family: this.family, weight: patch.weight ?? this.weight, style: patch.style ?? this.style, system: this.system, google: this.google, fallback: this.fallback_families, handle: this.handle });
  }
  get size() { return this.family.length; }
  toString() { return this.family; }
  valueOf() { return this.family; }
  toJSON() { return { family: this.family, fallback_families: this.fallback_families, weight: this.weight, style: this.style, system: this.system }; }
}

/** "din_next_n7" → police. Retourne null si la valeur n'a pas la forme d'un identifiant de police. */
export function parseFontHandle(handle: unknown): FontDrop | null {
  if (handle instanceof FontDrop) return handle;
  if (typeof handle !== "string") return null;
  const m = /^([a-z0-9_]+?)_([ni])(\d)$/.exec(handle.trim());
  if (!m) return null;
  const [, slug, styleCode, weightDigit] = m;
  const weight = Number(weightDigit) * 100;
  const style = styleCode === "i" ? "italic" : "normal";
  // Correspondance par préfixe : "neuzeit_office_soft_rounded" → "neuzeit_office".
  const propKey = Object.keys(PROPRIETARY).filter((k) => slug === k || slug.startsWith(`${k}_`)).sort((a, b) => b.length - a.length)[0];
  const prop = propKey ? PROPRIETARY[propKey] : undefined;
  if (prop) {
    const family = prop.family;
    const fallback = prop.fallback ?? (SERIF_HINT.test(family) ? "serif" : "sans-serif");
    return new FontDrop({ family, weight, style, system: !!prop.system, google: prop.system ? null : family, fallback, handle });
  }
  const google = GOOGLE_BY_KEY.get(slug.replace(/_/g, ""));
  const family = google ?? slug.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const fallback = SERIF_HINT.test(family) ? "serif" : /mono|code|courier/i.test(family) ? "monospace" : "sans-serif";
  // Famille inconnue : on tente quand même Google Fonts (beaucoup de polices Shopify y existent sous le même nom).
  return new FontDrop({ family, weight, style, system: false, google: family, fallback, handle });
}

/** Adresse CSS Google Fonts pour une famille et une liste de déclinaisons [poids, italique]. */
export function googleCssUrl(family: string, variants: Array<[number, boolean]>, display = "swap"): string {
  const uniq = [...new Map(variants.map((v) => [`${v[1] ? 1 : 0},${v[0]}`, v])).values()].sort((a, b) => (a[1] === b[1] ? a[0] - b[0] : a[1] ? 1 : -1));
  const axes = uniq.map(([w, i]) => `${i ? 1 : 0},${w}`).join(";");
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:ital,wght@${axes}&display=${display}`;
}

/** Collecte des polices utilisées pendant un rendu, pour injecter une seule balise <link> dans <head>. */
export class FontCollector {
  private readonly families = new Map<string, Array<[number, boolean]>>();
  add(font: FontDrop) {
    if (!font.google) return;
    const list = this.families.get(font.google) ?? [];
    list.push([font.weight, font.style === "italic"]);
    this.families.set(font.google, list);
  }
  /** Balises à insérer avant </head> ("" si aucune police web). */
  headTags(): string {
    if (!this.families.size) return "";
    const families = [...this.families.entries()].map(([family, variants]) => {
      const uniq = [...new Map(variants.map((v) => [`${v[1] ? 1 : 0},${v[0]}`, v])).values()].sort((a, b) => (a[1] === b[1] ? a[0] - b[0] : a[1] ? 1 : -1));
      return `${encodeURIComponent(family).replace(/%20/g, "+")}:ital,wght@${uniq.map(([w, i]) => `${i ? 1 : 0},${w}`).join(";")}`;
    });
    const href = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;
    return `<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="${href}">\n`;
  }
}

/** Sortie du filtre `font_face` : Shopify émet un @font-face vers son CDN ; nous laissons un commentaire CSS (le <link> fait le travail). */
export function fontFaceCss(font: FontDrop, display?: string): string {
  if (font.system || !font.google) return `/* ${font.family} : police système */`;
  return `/* @font-face ${font.family} ${font.weight} ${font.style} : chargée via Google Fonts${display ? ` (font-display: ${display})` : ""} */`;
}
