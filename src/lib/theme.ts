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
  type: z.literal("hero"),
  title: text(120),
  subtitle: text(300),
  buttonLabel: text(40),
  buttonLink: text(200),
  image: z.string().max(300).nullable().default(null),
});
const featuredSection = z.object({
  id: z.string(),
  type: z.literal("featured"),
  title: text(120),
  collectionHandle: z.string().max(80).nullable().default(null), // null = derniers produits
  limit: z.number().int().min(2).max(12).default(4),
});
const textSection = z.object({
  id: z.string(),
  type: z.literal("text"),
  title: text(120),
  body: text(2000),
});
const bannerSection = z.object({
  id: z.string(),
  type: z.literal("banner"),
  title: text(120),
  buttonLabel: text(40),
  buttonLink: text(200),
  image: z.string().max(300).nullable().default(null),
});
const collectionsSection = z.object({
  id: z.string(),
  type: z.literal("collections"),
  title: text(120),
});

export const sectionSchema = z.discriminatedUnion("type", [
  heroSection,
  featuredSection,
  textSection,
  bannerSection,
  collectionsSection,
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
