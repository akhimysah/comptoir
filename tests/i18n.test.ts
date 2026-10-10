import { describe, expect, it } from "vitest";
import { dict, readTranslations, translate } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { defaultTheme, translateTheme } from "@/lib/theme";

/** Boutique en plusieurs langues : contenus traduits par le marchand, textes de l'interface. */
describe("traductions", () => {
  const product = { title: "Bol Céladon", description: "Grès émaillé", translations: JSON.stringify({ en: { title: "Celadon bowl", description: "  " } }) };

  it("remplace les champs traduits et garde le français pour le reste", () => {
    const en = translate(product, "en", ["title", "description"]);
    expect(en.title).toBe("Celadon bowl");
    expect(en.description).toBe("Grès émaillé"); // traduction vide : texte d'origine
    expect(translate(product, "fr", ["title"]).title).toBe("Bol Céladon");
    expect(product.title).toBe("Bol Céladon"); // l'objet d'origine n'est pas modifié
  });

  it("supporte un JSON de traductions vide ou abîmé", () => {
    expect(readTranslations("pas du json")).toEqual({});
    expect(translate({ title: "A", translations: "[1]" }, "en", ["title"]).title).toBe("A");
  });

  it("traduit le bandeau et les sections du thème", () => {
    const theme = defaultTheme("Atelier");
    const hero = theme.sections.find((s) => s.type === "hero")! as Extract<(typeof theme.sections)[number], { type: "hero" }>;
    const t = translateTheme({ ...theme, announcement: "Livraison offerte" }, { announcement: "Free shipping", [`s.${hero.id}.title`]: "Handmade ceramics" });
    expect(t.announcement).toBe("Free shipping");
    expect(t.sections.find((s) => s.id === hero.id)!.title).toBe("Handmade ceramics");
    expect((t.sections.find((s) => s.id === hero.id) as typeof hero).subtitle).toBe(hero.subtitle);
  });

  it("formate les montants à l'anglaise et les dictionnaires restent complets", () => {
    expect(formatMoney(1960, "EUR", "en-GB")).toBe("€19.60");
    expect(formatMoney(1960, "EUR")).toMatch(/^19,60\s€$/);
    const T = dict({ n: (k: number) => `${k} article${k > 1 ? "s" : ""}` }, { n: (k: number) => `${k} item${k > 1 ? "s" : ""}` });
    expect(T.en.n(2)).toBe("2 items");
  });
});
