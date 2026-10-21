import { z } from "zod";

export const FONTS = {
  moderne: { label: "Moderne", display: "var(--f-dmsans)", body: "var(--f-dmsans)" },
  editorial: { label: "Éditorial", display: "var(--f-fraunces)", body: "var(--f-dmsans)" },
  geometrique: { label: "Géométrique", display: "var(--f-syne)", body: "var(--f-manrope)" },
  classique: { label: "Classique", display: "var(--f-cormorant)", body: "var(--f-manrope)" },
} as const;
export type FontKey = keyof typeof FONTS;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const text = (max: number) => z.string().max(max).default("");

const heroSection = z.object({
  id: z.string(),
  hidden: z.boolean().optional(),
  type: z.literal("hero"),
  title: text(120),
  subtitle: text(300),
  buttonLabel: text(40),
  buttonLink: text(200),
  image: z.string().max(300).nullable().default(null),
});
const featuredSection = z.object({
  id: z.string(),
  hidden: z.boolean().optional(),
  type: z.literal("featured"),
  title: text(120),
  collectionHandle: z.string().max(80).nullable().default(null), // null = derniers produits
  limit: z.number().int().min(2).max(12).default(4),
});
const textSection = z.object({
  id: z.string(),
  hidden: z.boolean().optional(),
  type: z.literal("text"),
  title: text(120),
  body: text(2000),
});
const bannerSection = z.object({
  id: z.string(),
  hidden: z.boolean().optional(),
  type: z.literal("banner"),
  title: text(120),
  buttonLabel: text(40),
  buttonLink: text(200),
  image: z.string().max(300).nullable().default(null),
});
const collectionsSection = z.object({
  id: z.string(),
  hidden: z.boolean().optional(),
  type: z.literal("collections"),
  title: text(120),
});

const img = z.string().max(300).nullable().default(null);
const link = text(200);
/** Diaporama : plusieurs grandes images qui défilent (comme « Slideshow » des thèmes Shopify). */
const slideshowSection = z.object({
  id: z.string(), hidden: z.boolean().optional(), type: z.literal("slideshow"),
  slides: z.array(z.object({ title: text(120), subtitle: text(300), buttonLabel: text(40), buttonLink: link, image: img })).min(1).max(5),
});
/** Colonnes avec icône, titre et texte (« Multicolumn », « Icons row », « Features »). */
const multicolumnSection = z.object({
  id: z.string(), hidden: z.boolean().optional(), type: z.literal("multicolumn"), title: text(120),
  columns: z.array(z.object({ icon: text(4), title: text(80), text: text(300) })).max(6),
});
/** Témoignages clients (« Testimonials », « Press »). */
const testimonialsSection = z.object({
  id: z.string(), hidden: z.boolean().optional(), type: z.literal("testimonials"), title: text(120),
  items: z.array(z.object({ quote: text(400), author: text(80), rating: z.number().int().min(0).max(5).default(5) })).max(8),
});
/** Inscription à la newsletter. */
const newsletterSection = z.object({ id: z.string(), hidden: z.boolean().optional(), type: z.literal("newsletter"), title: text(120), body: text(300) });
/** Questions fréquentes (« FAQ », « Collapsible content »). */
const faqSection = z.object({
  id: z.string(), hidden: z.boolean().optional(), type: z.literal("faq"), title: text(120),
  items: z.array(z.object({ question: text(200), answer: text(1000) })).max(12),
});
/** Texte qui défile en bandeau (« Scrolling text », « Marquee »). */
const marqueeSection = z.object({ id: z.string(), hidden: z.boolean().optional(), type: z.literal("marquee"), body: text(200) });
/** Un produit mis en avant en grand (« Featured product »). */
const featuredProductSection = z.object({ id: z.string(), hidden: z.boolean().optional(), type: z.literal("featuredProduct"), title: text(120), productHandle: z.string().max(80).nullable().default(null) });
/** Compte à rebours vers une date (« Countdown timer »). */
const countdownSection = z.object({ id: z.string(), hidden: z.boolean().optional(), type: z.literal("countdown"), title: text(120), endsAt: text(30), buttonLabel: text(40), buttonLink: link });
/** Galerie d'images (« Media grid », « Image collage »). */
const gallerySection = z.object({ id: z.string(), hidden: z.boolean().optional(), type: z.literal("gallery"), title: text(120), images: z.array(z.string().max(300)).max(8) });
/** Vidéo YouTube ou Vimeo. */
const videoSection = z.object({ id: z.string(), hidden: z.boolean().optional(), type: z.literal("video"), title: text(120), url: text(300) });
/** Derniers articles du blog (« Blog posts », « Featured blog »). */
const blogSection = z.object({ id: z.string(), hidden: z.boolean().optional(), type: z.literal("blog"), title: text(120), limit: z.number().int().min(1).max(6).default(3) });

export const sectionSchema = z.discriminatedUnion("type", [
  heroSection,
  featuredSection,
  textSection,
  bannerSection,
  collectionsSection,
  slideshowSection,
  multicolumnSection,
  testimonialsSection,
  newsletterSection,
  faqSection,
  marqueeSection,
  featuredProductSection,
  countdownSection,
  gallerySection,
  videoSection,
  blogSection,
]);
export type Section = z.infer<typeof sectionSchema>;
export type SectionType = Section["type"];

export const themeSchema = z.object({
  colors: z.object({
    background: hex,
    surface: hex,
    text: hex,
    muted: hex,
    accent: hex,
    accentText: hex,
  }),
  font: z.enum(Object.keys(FONTS) as [FontKey, ...FontKey[]]),
  radius: z.enum(["none", "small", "large"]),
  announcement: text(140),
  sections: z.array(sectionSchema).max(20),
});
export type Theme = z.infer<typeof themeSchema>;

export const SECTION_LABELS: Record<SectionType, string> = {
  hero: "Grande bannière d'accueil",
  featured: "Produits mis en avant",
  text: "Texte",
  banner: "Image avec texte",
  collections: "Liste des collections",
  slideshow: "Diaporama",
  multicolumn: "Colonnes avec icônes",
  testimonials: "Témoignages",
  newsletter: "Newsletter",
  faq: "Questions fréquentes",
  marquee: "Texte défilant",
  featuredProduct: "Produit vedette",
  countdown: "Compte à rebours",
  gallery: "Galerie d'images",
  video: "Vidéo",
  blog: "Articles du blog",
};

export const PRESETS: Record<string, { label: string; colors: Theme["colors"]; font: FontKey; radius: Theme["radius"] }> = {
  argile: {
    label: "Argile",
    colors: { background: "#F7F3EE", surface: "#FFFFFF", text: "#2B211B", muted: "#7A6A5E", accent: "#A4522F", accentText: "#FFFFFF" },
    font: "editorial",
    radius: "small",
  },
  minuit: {
    label: "Minuit",
    colors: { background: "#0F1115", surface: "#181B22", text: "#EEF0F4", muted: "#9298A6", accent: "#E8C468", accentText: "#14120A" },
    font: "geometrique",
    radius: "none",
  },
  menthe: {
    label: "Menthe",
    colors: { background: "#F2F7F4", surface: "#FFFFFF", text: "#13241D", muted: "#5B7066", accent: "#1F6F5C", accentText: "#FFFFFF" },
    font: "moderne",
    radius: "large",
  },
  papier: {
    label: "Papier",
    colors: { background: "#FFFFFF", surface: "#F5F5F2", text: "#111111", muted: "#6B6B66", accent: "#111111", accentText: "#FFFFFF" },
    font: "classique",
    radius: "none",
  },
  // Modèles inspirés des thèmes Shopify du marchand (couleurs, polices et arrondis relevés dans leurs réglages).
  concept: {
    label: "Concept",
    colors: { background: "#FFFFFF", surface: "#FAFAFA", text: "#171717", muted: "#6B6B6B", accent: "#171717", accentText: "#FFFFFF" },
    font: "moderne",
    radius: "large",
  },
  digital: {
    label: "Digital",
    colors: { background: "#FFFFFF", surface: "#F7F8F8", text: "#011624", muted: "#67737C", accent: "#1566E0", accentText: "#FFFFFF" },
    font: "moderne",
    radius: "small",
  },
  impact: {
    label: "Impact",
    colors: { background: "#F0F0F0", surface: "#FFFFFF", text: "#1A1A1A", muted: "#5C5C5C", accent: "#F0C417", accentText: "#1A1A1A" },
    font: "geometrique",
    radius: "large",
  },
  paloalto: {
    label: "Palo Alto",
    colors: { background: "#FFFFFF", surface: "#F4F3F1", text: "#0B0B0B", muted: "#6B6B6B", accent: "#000000", accentText: "#FFFFFF" },
    font: "geometrique",
    radius: "large",
  },
  prestige: {
    label: "Prestige",
    colors: { background: "#FFFFFF", surface: "#F3F3F3", text: "#1C1C1C", muted: "#5C5C5C", accent: "#1C1C1C", accentText: "#FFFFFF" },
    font: "classique",
    radius: "none",
  },
  mysah: {
    label: "Mysah le BG",
    colors: { background: "#FFFFFF", surface: "#F3F3F3", text: "#121212", muted: "#6E6E6E", accent: "#334FB4", accentText: "#FFFFFF" },
    font: "editorial",
    radius: "none",
  },
};

export const newSectionId = () => Math.random().toString(36).slice(2, 10);

export function blankSection(type: SectionType): Section {
  const id = newSectionId();
  switch (type) {
    case "hero":
      return { id, type, title: "Votre titre ici", subtitle: "Présentez votre boutique en une phrase.", buttonLabel: "Découvrir", buttonLink: "/products", image: null };
    case "featured":
      return { id, type, title: "Nos produits", collectionHandle: null, limit: 4 };
    case "text":
      return { id, type, title: "Notre histoire", body: "Racontez qui vous êtes et comment vous fabriquez vos produits." };
    case "banner":
      return { id, type, title: "Nouvelle collection", buttonLabel: "Voir", buttonLink: "/products", image: null };
    case "collections":
      return { id, type, title: "Nos collections" };
    case "slideshow":
      return { id, type, slides: [{ title: "Nouvelle collection", subtitle: "Découvrez nos dernières pièces.", buttonLabel: "Découvrir", buttonLink: "/products", image: null }, { title: "Livraison offerte", subtitle: "Dès 50 € d'achat, partout en France.", buttonLabel: "Voir la boutique", buttonLink: "/products", image: null }] };
    case "multicolumn":
      return { id, type, title: "Pourquoi nous choisir", columns: [{ icon: "🚚", title: "Livraison rapide", text: "Expédition sous 24 h, suivi en temps réel." }, { icon: "↩️", title: "Retours faciles", text: "30 jours pour changer d'avis." }, { icon: "🔒", title: "Paiement sécurisé", text: "Carte, Apple Pay, Google Pay." }] };
    case "testimonials":
      return { id, type, title: "Ils nous font confiance", items: [{ quote: "Qualité au rendez-vous et livraison très rapide. Je recommande !", author: "Camille", rating: 5 }, { quote: "Le service client a répondu en quelques minutes. Parfait.", author: "Mehdi", rating: 5 }, { quote: "Des produits magnifiques, conformes aux photos.", author: "Léa", rating: 5 }] };
    case "newsletter":
      return { id, type, title: "Restez informé", body: "Inscrivez-vous pour recevoir nos nouveautés et offres en avant-première." };
    case "faq":
      return { id, type, title: "Questions fréquentes", items: [{ question: "Quels sont les délais de livraison ?", answer: "Vos commandes sont expédiées sous 24 à 48 h et livrées en 2 à 4 jours ouvrés." }, { question: "Puis-je retourner un article ?", answer: "Oui, vous avez 30 jours après réception pour nous le renvoyer." }, { question: "Comment suivre ma commande ?", answer: "Un e-mail avec le lien de suivi vous est envoyé dès l'expédition." }] };
    case "marquee":
      return { id, type, body: "Livraison offerte dès 50 € · Retours sous 30 jours · Paiement sécurisé" };
    case "featuredProduct":
      return { id, type, title: "Notre coup de cœur", productHandle: null };
    case "countdown":
      return { id, type, title: "Offre de lancement : −20 % sur tout", endsAt: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10), buttonLabel: "J'en profite", buttonLink: "/products" };
    case "gallery":
      return { id, type, title: "En images", images: [] };
    case "video":
      return { id, type, title: "Découvrez l'atelier", url: "" };
    case "blog":
      return { id, type, title: "Le journal", limit: 3 };
  }
}

type S = Extract<Section, { type: "hero" }>;
/**
 * Page d'accueil livrée avec chaque modèle, comme les sections préinstallées d'un thème Shopify
 * (ordre relevé sur la page d'accueil du thème d'origine, adapté à nos sections).
 */
export function presetSections(key: string, storeName: string, tagline = ""): Section[] {
  const hero = (title: string, subtitle: string, buttonLabel = "Découvrir"): Section => ({ ...(blankSection("hero") as S), title, subtitle, buttonLabel });
  const b = blankSection;
  const withTitle = <T extends SectionType>(type: T, title: string) => ({ ...b(type), title }) as Section;
  const intro = hero(storeName, tagline || "Bienvenue dans notre boutique.");
  switch (key) {
    case "concept": // Concept : diaporama, texte de marque, collections, produit vedette, défilant, témoignages, meilleures ventes, blog
      return [b("slideshow"), withTitle("text", `Parlons de ${storeName}`), b("collections"), b("featuredProduct"), b("marquee"), b("testimonials"), withTitle("featured", "Meilleures ventes"), withTitle("blog", "Dernières histoires")];
    case "digital": // Digital : héros, grille de collections, colonnes, produits populaires, image + texte, témoignages, blog, FAQ
      return [intro, b("collections"), b("multicolumn"), withTitle("featured", "Produits populaires"), b("banner"), b("testimonials"), withTitle("blog", "Derniers articles"), b("faq"), b("newsletter")];
    case "impact": // Impact : diaporama, défilant, collections, collection vedette, texte impact, image + texte, galerie, presse, produit vedette, FAQ
      return [b("slideshow"), b("marquee"), b("collections"), withTitle("featured", "Collection vedette"), withTitle("text", "Des produits qui marquent"), b("banner"), b("gallery"), b("testimonials"), b("featuredProduct"), b("faq")];
    case "paloalto": // Palo Alto : diaporama, compte à rebours, texte, galerie, défilant, collection, témoignages, histoire, presse, newsletter, icônes
      return [b("slideshow"), b("countdown"), withTitle("text", "Notre histoire, notre promesse"), b("gallery"), b("marquee"), withTitle("featured", "Meilleures ventes"), b("testimonials"), b("banner"), b("newsletter"), b("multicolumn")];
    case "prestige": // Prestige : diaporama, collections vedettes, colonnes images, liste de collections, image + texte, newsletter, blog
      return [b("slideshow"), withTitle("featured", "Sélection"), b("multicolumn"), b("collections"), b("banner"), b("newsletter"), b("blog")];
    case "mysah": // Dawn personnalisé : diaporama, texte riche, produit vedette, bandeau défilant, deux images + texte, avantages
      return [b("slideshow"), withTitle("text", storeName), b("featuredProduct"), b("marquee"), b("banner"), withTitle("banner", "Fabriqué avec soin"), b("multicolumn")];
    case "argile":
      return [intro, withTitle("featured", "Nos pièces"), withTitle("text", "Fait main, avec soin"), b("banner"), b("collections"), b("testimonials"), b("newsletter")];
    case "minuit":
      return [b("slideshow"), b("marquee"), withTitle("featured", "Nouveautés"), b("featuredProduct"), b("collections"), b("video"), b("faq")];
    case "menthe":
      return [intro, b("multicolumn"), withTitle("featured", "Nos produits"), b("banner"), b("testimonials"), b("collections"), b("newsletter")];
    case "papier":
      return [intro, withTitle("featured", "Sélection"), b("collections"), withTitle("text", "À propos"), b("gallery"), b("blog")];
    default:
      return [intro, b("featured"), b("collections")];
  }
}

export function defaultTheme(storeName: string, tagline = ""): Theme {
  const p = PRESETS.menthe;
  return {
    colors: p.colors,
    font: p.font,
    radius: p.radius,
    announcement: "",
    sections: [
      { ...(blankSection("hero") as Extract<Section, { type: "hero" }>), title: storeName, subtitle: tagline || "Bienvenue dans notre boutique." },
      blankSection("featured"),
      blankSection("collections"),
    ],
  };
}

/** Textes des sections que le marchand peut traduire (clé de traduction : « s.<id de section>.<champ> »). */
export const SECTION_TEXT_FIELDS = ["title", "subtitle", "body", "buttonLabel"] as const;

/** Thème avec ses textes traduits (bandeau d'annonce et sections), d'après les traductions de la boutique. */
export function translateTheme(theme: Theme, t: Record<string, string> | undefined): Theme {
  if (!t) return theme;
  const pick = (key: string, fallback: string) => (t[key]?.trim() ? t[key] : fallback);
  return {
    ...theme,
    announcement: pick("announcement", theme.announcement),
    sections: theme.sections.map((sec) => {
      const out: Record<string, unknown> = { ...sec };
      for (const f of SECTION_TEXT_FIELDS) if (typeof out[f] === "string") out[f] = pick(`s.${sec.id}.${f}`, out[f] as string);
      return out as Section;
    }),
  };
}

export function readTheme(raw: string, storeName: string): Theme {
  try {
    const parsed = themeSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {}
  return defaultTheme(storeName);
}

export const RADIUS = { none: "0px", small: "6px", large: "18px" } as const;

/** Variables CSS appliquées à la vitrine et à l'aperçu de l'éditeur. */
export function themeVars(theme: Theme): Record<string, string> {
  const f = FONTS[theme.font];
  return {
    "--c-bg": theme.colors.background,
    "--c-surface": theme.colors.surface,
    "--c-text": theme.colors.text,
    "--c-muted": theme.colors.muted,
    "--c-accent": theme.colors.accent,
    "--c-accent-text": theme.colors.accentText,
    "--t-display": f.display,
    "--t-body": f.body,
    "--t-radius": RADIUS[theme.radius],
  };
}
