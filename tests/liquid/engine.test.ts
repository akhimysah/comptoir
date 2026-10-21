import { describe, expect, it } from "vitest";
import { renderPage, renderSection, sectionSchema, themeSettings } from "@/lib/liquid/engine";
import type { PageData } from "@/lib/liquid/types";
import { memorySource } from "./memory-source";
import { samplePageData } from "./sample-data";

const LAYOUT = `<!doctype html><html><head><title>{{ page_title }}</title>{{ content_for_header }}</head><body class="template-{{ template }}">{% sections 'header-group' %}<main>{{ content_for_layout }}</main></body></html>`;

const HERO = `<h1 class="{{ section.settings.align }}">{{ section.settings.title }}</h1>
{% for block in section.blocks %}<p {{ block.shopify_attributes }}>{{ block.settings.text }}</p>{% endfor %}
{% schema %}
{ "name": "Hero", "class": "hero-section", "tag": "section",
  "settings": [ { "type": "text", "id": "title", "default": "Bienvenue" }, { "type": "select", "id": "align", "default": "center" }, { "type": "color", "id": "bg", "default": "#ff0000" } ],
  "blocks": [ { "type": "line", "settings": [ { "type": "text", "id": "text", "default": "Ligne" } ] } ],
  "presets": [ { "name": "Hero", "settings": { "title": "Preset" }, "blocks": [ { "type": "line" } ] } ] }
{% endschema %}`;

function theme(extra: Record<string, string> = {}, omit: string[] = []) {
  const files: Record<string, string> = {
    "layout/theme.liquid": LAYOUT,
    "sections/hero.liquid": HERO,
    "sections/header.liquid": `<header>{{ shop.name }} {{ 'general.hello' | t }}</header>{% schema %}{ "name": "Header" }{% endschema %}`,
    "sections/header-group.json": JSON.stringify({ type: "header", name: "Header group", sections: { header: { type: "header", settings: {} }, off: { type: "header", disabled: true } }, order: ["header", "off"] }),
    "templates/index.json": JSON.stringify({ sections: { hero: { type: "hero", settings: { title: "Salut", align: "left" }, blocks: { b1: { type: "line", settings: { text: "Un" } }, b2: { type: "line", settings: { text: "Deux" }, disabled: true } }, block_order: ["b2", "b1"] }, bare: { type: "hero" } }, order: ["hero", "bare"] }),
    "config/settings_schema.json": JSON.stringify([{ name: "theme_info", theme_name: "Test" }, { name: "Colors", settings: [{ type: "color", id: "accent", default: "#112233" }, { type: "font_picker", id: "heading_font", default: "din_next_n7" }, { type: "color_scheme_group", id: "color_schemes", definition: [{ type: "color", id: "background", default: "#ffffff" }, { type: "color", id: "text", default: "#121212" }] }, { type: "color_scheme", id: "card_scheme", default: "scheme-2" }] }]),
    "config/settings_data.json": JSON.stringify({ current: { accent: "#aabbcc", color_schemes: { "scheme-1": { settings: { background: "#ffffff", text: "#000000" } }, "scheme-2": { settings: { background: "#111111", text: "#eeeeee" } } } } }),
    "locales/en.default.json": JSON.stringify({ general: { hello: "Hello", items: { one: "{{ count }} item", other: "{{ count }} items" }, greet_html: "<b>Hi {{ name }}</b>" } }),
    "locales/fr.json": JSON.stringify({ general: { hello: "Bonjour" } }),
    ...extra,
  };
  for (const k of omit) delete files[k];
  return memorySource(files, `t-${Object.keys(extra).join(",")}`);
}

/** Rend un gabarit Liquid `index` (le gabarit JSON du thème de test est retiré pour lui laisser la place). */
async function render(files: Record<string, string>, body: string, overrides: Partial<PageData> = {}) {
  const template = overrides.template ?? "index";
  const src = theme({ [`templates/${template}.liquid`]: body, ...files }, ["templates/index.json"]);
  const res = await renderPage(src, samplePageData({ template, ...overrides }));
  return res.html;
}
const inner = (html: string) => html.slice(html.indexOf("<main>") + 6, html.indexOf("</main>"));

describe("moteur Liquid : pages et sections", () => {
  it("rend layout + gabarit JSON + sections avec défauts de schéma, blocs ordonnés et presets", async () => {
    const res = await renderPage(theme(), samplePageData());
    expect(res.status).toBe(200);
    expect(res.html).toContain("<title>Boutique Démo</title>");
    expect(res.html).toContain('<section id="shopify-section-hero" class="shopify-section hero-section">');
    expect(res.html).toContain('<h1 class="left">Salut</h1>');
    expect(res.html).toContain("<p >Un</p>");
    expect(res.html).not.toContain("Deux");
    // Section sans réglages : preset appliqué (titre + un bloc par défaut).
    expect(res.html).toContain('<h1 class="center">Preset</h1>');
    expect(res.html).toContain("<p >Ligne</p>");
    expect(res.html).toContain("window.Shopify");
    expect(res.html).toContain('class="template-index"');
  });

  it("rend {% sections 'header-group' %} en ignorant les sections désactivées", async () => {
    const res = await renderPage(theme(), samplePageData());
    expect(res.html.match(/shopify-section-group-header-group/g)?.length).toBe(1);
    expect(res.html).toContain("<header>Boutique Démo Bonjour</header>");
  });

  it("mode éditeur : attributs de section et de bloc", async () => {
    const res = await renderPage(theme(), samplePageData({ design_mode: true }));
    expect(res.html).toContain('data-section-id="hero" data-section-type="hero"');
    expect(res.html).toContain('data-shopify-editor-block="{&quot;id&quot;:&quot;b1&quot;,&quot;type&quot;:&quot;line&quot;}"');
  });

  it("une section en erreur ne casse pas la page", async () => {
    const src = theme({ "sections/hero.liquid": "{% if %}{% endfor %}" });
    const res = await renderPage(src, samplePageData());
    expect(res.html).toContain("<!-- section hero error:");
    expect(res.html).toContain("</html>");
  });

  it("renderSection rend une section isolée du gabarit ou d'un groupe", async () => {
    expect(await renderSection(theme(), samplePageData(), "hero")).toContain("Salut");
    expect(await renderSection(theme(), samplePageData(), "header")).toContain("shopify-section-group-header-group");
    expect(await renderSection(theme(), samplePageData(), "nope")).toContain("introuvable");
  });

  it("404 : gabarit 404 si présent, sinon message, statut 404", async () => {
    const res = await renderPage(theme({ "templates/404.liquid": "<h1>Perdu</h1>" }), samplePageData({ template: "page" }));
    expect(res.status).toBe(404);
    expect(res.html).toContain("Perdu");
    const empty = await renderPage(memorySource({}), samplePageData({ template: "index" }));
    expect(empty.status).toBe(404);
    expect(empty.html).toContain("<html");
  });

  it("themeSettings et sectionSchema", async () => {
    const s = await themeSettings(theme());
    expect(s.settings.accent).toBe("#aabbcc");
    expect(s.settings.heading_font).toBe("din_next_n7");
    expect(Array.isArray(s.schema)).toBe(true);
    const schema = await sectionSchema(theme(), "hero");
    expect(schema?.name).toBe("Hero");
    expect(await sectionSchema(theme(), "nope")).toBeNull();
  });
});

describe("tags Shopify", () => {
  it("render : paramètres, with, for, isolation et snippet manquant", async () => {
    const files = { "snippets/item.liquid": "[{{ item.title }}{{ forloop.index }}{{ x }}{{ outer }}]", "snippets/w.liquid": "<{{ w.title }}>" };
    const html = inner(await render(files, `{% assign outer = 'O' %}{% render 'item' with collections.frontpage.products.first as item, x: 'X' %}{% render 'item' for collections.frontpage.products as item %}{% render 'w' with pages.about as w %}{% render 'missing' %}`));
    expect(html).toContain("[T-shirt coton bioX]");
    expect(html).toContain("[T-shirt coton bio1][Sweat à capuche2][Casquette logo3]");
    expect(html).toContain("<À propos>");
    expect(html).toContain("Liquid error: Could not find asset snippets/missing.liquid");
  });

  it("render dans {% liquid %} multi-lignes et include partageant la portée", async () => {
    const files = { "snippets/a.liquid": "A{{ v }}", "snippets/b.liquid": "{% assign shared = 'S' %}" };
    const html = inner(await render(files, `{%- liquid\n  assign v = 1\n  render 'a', v: v\n  include 'b'\n-%}{{ shared }}`));
    expect(html).toBe("A1S");
  });

  it("form : action, champs cachés, objet form et erreurs", async () => {
    const html = inner(await render({}, `{% form 'contact', id: 'cf', class: 'c' %}{{ form.posted_successfully }}{{ form.errors | default_errors }}{% endform %}{% form 'product', product %}{% endform %}{% form 'customer_login' %}{% endform %}`, {
      template: "product", form_results: { contact: { posted_successfully: false, errors: ["Email invalide"], fields: { email: "x" } } },
    }));
    expect(html).toContain('<form method="post" action="/s/demo/contact" id="cf" accept-charset="UTF-8" class="c"><input type="hidden" name="form_type" value="contact">');
    expect(html).toContain("false");
    expect(html).toContain("<li>Email invalide</li>");
    expect(html).toContain('action="/s/demo/cart/add" id="product_form_7001"');
    expect(html).toContain('action="/s/demo/account/login" id="customer_login"');
  });

  it("paginate : objet paginate et découpage", async () => {
    const html = inner(await render({}, `{% paginate collection.products by 2 %}{% for p in collection.products %}{{ p.handle }},{% endfor %}|{{ paginate.pages }}|{{ paginate.next.url }}|{{ paginate.parts.size }}{% endpaginate %}`, { template: "collection" }));
    expect(html).toBe("t-shirt-coton-bio,sweat-capuche,|2|/s/demo/collections/frontpage?page=2|2");
    const p2 = inner(await render({}, `{% paginate collection.products by 2 %}{% for p in collection.products %}{{ p.handle }},{% endfor %}{{ paginate.previous.url }}{% endpaginate %}`, { template: "collection", current_page: 2 }));
    expect(p2).toBe("casquette-logo,/s/demo/collections/frontpage?page=1");
  });

  it("style, stylesheet et javascript", async () => {
    const files = { "sections/css.liquid": "{% style %}.a{color:{{ section.settings.c }}}{% endstyle %}{% stylesheet %}.b{}{% endstylesheet %}{% javascript %}console.log(1){% endjavascript %}{% schema %}{\"name\":\"css\",\"settings\":[{\"type\":\"color\",\"id\":\"c\",\"default\":\"#000\"}]}{% endschema %}" };
    const html = await render(files, `{% section 'css' %}{% section 'css' %}`);
    expect(html).toContain("<style data-shopify>.a{color:#000000}</style>");
    expect(html.match(/\.b\{\}/g)?.length).toBe(1);
    expect(html).toContain("console.log(1)");
    expect(html.indexOf("<style data-shopify-collected>")).toBeGreaterThan(html.indexOf("</main>"));
    expect(html.indexOf("</body>")).toBeGreaterThan(html.indexOf("<script>(function(){"));
  });

  it("layout none et layout nommé", async () => {
    const none = await render({}, `{% layout none %}corps`);
    expect(none).toBe("corps");
    const alt = await render({ "layout/alt.liquid": "ALT{{ content_for_layout }}" }, `{% layout 'alt' %}corps`);
    expect(alt).toContain("ALTcorps");
  });

  it("erreurs inline : filtre qui plante ou tag inconnu dans un snippet", async () => {
    const html = inner(await render({ "snippets/bad.liquid": "{% nope %}" }, `a{% render 'bad' %}b{{ 'x' | unknown_filter }}c`));
    expect(html).toContain("Liquid syntax error (snippets/bad");
    expect(html).toContain("bxc");
  });
});

describe("filtres", () => {
  const f = (expr: string, overrides: Partial<PageData> = {}) => render({}, `{% layout none %}${expr}`, overrides);

  it("t : repli, pluriel, variables, html", async () => {
    expect(await f(`{{ 'general.hello' | t }}|{{ 'general.items' | t: count: 1 }}|{{ 'general.items' | t: count: 3 }}|{{ 'general.greet_html' | t: name: 'Zoé' }}|{{ 'nope.key' | t }}`)).toBe("Bonjour|1 item|3 items|<b>Hi Zoé</b>|nope.key");
  });

  it("money : formats et taux", async () => {
    expect(await f(`{{ 2900 | money }}|{{ 123456 | money_with_currency }}|{{ 2900 | money_without_trailing_zeros }}|{{ 2950 | money_without_currency }}`)).toBe("29,00 €|1.234,56 € EUR|29 €|29,50");
    expect(await f(`{{ 1000 | money }}`, { money: { format: "${{amount}}", formatWithCurrency: "${{amount}} USD", currency: "USD", rate: 1.1 } })).toBe("$11.00");
  });

  it("image_url / image_tag / img_url", async () => {
    const out = await f(`{{ product.featured_image | image_url: width: 600 }}|{{ product | image_url: width: 300, height: 300, crop: 'center' | image_tag: widths: '300, 600, 2000', sizes: '50vw', class: 'img', loading: 'lazy' }}|{{ product.featured_image | img_url: '450x' }}`, { template: "product" });
    const [a, b, c] = out.split("|");
    expect(a).toBe("https://demo.example.test/media/t-shirt-coton-bio-1.jpg?width=600");
    expect(b).toContain('<img src="https://demo.example.test/media/t-shirt-coton-bio-1.jpg?width=300&amp;height=300&amp;crop=center" alt="T-shirt coton bio" srcset="');
    expect(b).toContain("?width=600&amp;height=600&amp;crop=center 600w");
    expect(b).not.toContain("2000w");
    expect(b).toContain('width="300" height="300" loading="lazy" sizes="50vw" class="img"');
    expect(c).toBe("https://demo.example.test/media/t-shirt-coton-bio-1.jpg?width=450");
    expect(await f(`[{{ nothing | image_url: width: 10 }}]{{ 'x' | placeholder_svg_tag: 'ph' }}`)).toContain('[]<svg class="ph"');
  });

  it("couleurs", async () => {
    expect(await f(`{{ settings.accent }}|{{ settings.accent.red }}|{{ settings.accent.rgb }}|{{ settings.accent | color_lighten: 20 }}|{{ settings.accent | color_modify: 'alpha', 0.5 }}|{{ '#000' | color_brightness }}|{{ settings.accent | hex_to_rgba: 0.2 }}`))
      .toBe("#aabbcc|170|170, 187, 204|#eaeef2|rgba(170, 187, 204, 0.5)|0|rgba(170, 187, 204, 0.2)");
    expect(await f(`{{ settings.card_scheme }}|{{ settings.card_scheme.settings.background }}|{% for s in settings.color_schemes %}{{ s.id }}:{{ s.settings.text.red }} {% endfor %}|{{ settings.color_schemes | first }}`)).toBe("scheme-2|#111111|scheme-1:0 scheme-2:238 |scheme-1");
  });

  it("polices", async () => {
    const out = await f(`{{ settings.heading_font.family }}|{{ settings.heading_font.weight }}|{{ settings.heading_font.fallback_families }}|{{ settings.heading_font | font_modify: 'style', 'italic' | font_modify: 'weight', 'normal' }}{{ settings.heading_font | font_face: font_display: 'swap' }}|{{ settings.heading_font | font_url }}`);
    expect(out).toContain("Barlow|700|sans-serif|Barlow/* @font-face Barlow 700 normal");
    expect(out).toContain("https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,700&display=swap");
    const page = await render({}, `{{ settings.heading_font | font_face }}`);
    expect(page).toContain('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,700&display=swap">');
  });

  it("collections / template / handles", async () => {
    expect(await f(`{{ collections['vetements'].title }}|{{ collections.frontpage.products.size }}|{{ collections.all.products_count }}|{{ collections.size }}|{% for c in collections %}{{ c.handle }} {% endfor %}|{{ all_products['casquette-logo'].price }}|{{ linklists.main-menu.links.size }}|{{ pages.about.title }}|{{ blogs.news.articles_count }}`))
      .toBe("Vêtements|3|3|2|frontpage vetements |2500|4|À propos|2");
    expect(await f(`{% if template == 'index' %}idx{% endif %}{% if template contains 'ind' %}c{% endif %}{{ template.name }}{{ template.suffix }}|{{ handle }}|{{ template | replace: '.', ' ' | truncatewords: 1, '' | handle }}`)).toBe("idxcindex|index|index");
    expect(await f(`{{ template }}{{ template.suffix }}|{{ product.options_by_name['couleur'].values | join: ',' }}`, { template: "product", template_suffix: "alt" })).toBe("product.altalt|Noir,Blanc");
  });

  it("date (noms de mois dans la langue de la boutique)", async () => {
    expect(await f(`{{ '2026-03-05T10:30:00Z' | date: '%B %d, %Y' }}|{{ '2026-03-05T10:30:00Z' | date: format: 'abbreviated_date' }}|{{ 'now' | date: '%Y' | size }}|{{ 1700000000 | date: '%Y' }}|{{ nothing | date: '%Y' }}|{{ '2026-03-05T10:30:00Z' | time_tag: '%d/%m' }}`, { locale: "en" }))
      .toBe("March 05, 2026|Mar 05, 2026|4|2023||<time datetime=\"2026-03-05T10:30:00Z\">05/03</time>");
    expect(await f(`{{ '2026-03-05T10:30:00Z' | date: '%d %B %Y' }}`)).toBe("05 mars 2026");
  });

  it("default / where / json / divers", async () => {
    expect(await f(`{{ nothing | default: 'd' }}|{{ '' | default: 'd' }}|{{ false | default: 'd', allow_false: true }}|{{ images | default: 'd' }}|{{ 0 | default: 'd' }}`, { images: {} })).toBe("d|d|false|d|0");
    expect(await f(`{{ product.variants | where: 'available' | size }}|{{ product.variants | where: 'option1', 'M' | map: 'title' | join: ';' }}`, { template: "product" })).toBe("2|M / Noir;M / Blanc");
    const json = await f(`{{ settings.accent | json }}|{{ template | json }}|{{ settings.heading_font | json }}|{{ collections.frontpage.products | map: 'handle' | json }}|{{ product.options_by_name | json }}`, { template: "product" });
    expect(json).toContain('"#aabbcc"|"product"|{"family":"Barlow","fallback_families":"sans-serif","weight":700,"style":"normal","system":false}|["t-shirt-coton-bio","sweat-capuche","casquette-logo"]|{"Taille":');
    expect(await f(`{{ 7 | divided_by: 2 }}|{{ 7 | divided_by: 2.0 }}|{{ '12px' | plus: 1 }}|{{ 'a,b,' | split: ',' | size }}|{{ 'Été Noir!' | handleize }}|{{ 3.14159 | round: 2 }}|{{ cart | item_count_for_variant: '70011' }}|{{ 'hello world' | highlight: 'world' }}|{{ shop.address | format_address }}`))
      .toBe("3|3.5|13|2|ete-noir|3.14|2|hello <strong class=\"highlight\">world</strong>|<p>12 rue des Lilas<br>69001 Lyon<br>France</p>");
    expect(await f(`{{ 'base.css' | asset_url | stylesheet_tag }}{{ 'app.js' | asset_url | script_tag }}{{ 'icon.svg' | inline_asset_content }}`)).toBe('<link href="/s/demo/assets/base.css" rel="stylesheet" type="text/css" media="all"><script src="/s/demo/assets/app.js" type="text/javascript"></script>');
  });

  it("inline_asset_content lit les assets, structured_data produit du JSON-LD", async () => {
    const html = await render({ "assets/icon.svg": "<svg/>" }, `{% layout none %}{{ 'icon.svg' | inline_asset_content }}{{ product | structured_data }}`, { template: "product" });
    expect(html).toContain("<svg/>");
    expect(html).toContain('"@type":"Product"');
  });
});

describe("images choisies dans l'éditeur", () => {
  it("affiche une image de la bibliothèque (dimensions réelles) ou une simple adresse", async () => {
    const source = memorySource({
      "layout/theme.liquid": "{{ content_for_layout }}",
      "templates/index.json": JSON.stringify({ sections: { hero: { type: "hero", settings: { image: "/uploads/a.jpg", other: "https://cdn.exemple.fr/b.png" } } }, order: ["hero"] }),
      "sections/hero.liquid": `{{ section.settings.image.width }}x{{ section.settings.image.height }}|{{ section.settings.image | image_url: width: 800 | image_tag }}|{{ section.settings.other.aspect_ratio }}{% schema %}{"name":"Hero","settings":[{"type":"image_picker","id":"image"},{"type":"image_picker","id":"other"}]}{% endschema %}`,
    });
    const data = samplePageData({ images: { "/uploads/a.jpg": { id: "a", src: "/uploads/a.jpg", alt: "Atelier", width: 2000, height: 1000, aspect_ratio: 2 } } });
    const { html } = await renderPage(source, data);
    expect(html).toContain("2000x1000");
    expect(html).toContain('alt="Atelier"');
    expect(html).toMatch(/src="\/uploads\/a\.jpg\?width=800/);
    expect(html).toContain("|1");
  });
});
