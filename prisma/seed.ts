/**
 * Boutique de démonstration « Atelier Argile ».
 * Compte marchand de test : demo@comptoir.test / demo1234
 * (en ligne, définissez SEED_DEMO_PASSWORD pour choisir un autre mot de passe).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { defaultTheme, PRESETS, type Theme } from "../src/lib/theme";

const db = new PrismaClient();

const PRODUCTS = [
  { title: "Tasse Grès Sable", hue: 32, price: 2200, stock: 34, cols: ["tasses"], desc: "Tasse de 25 cl en grès émaillé. Passe au lave-vaisselle." },
  { title: "Bol Céladon", hue: 150, price: 2800, compare: 3400, stock: 12, cols: ["bols", "promos"], desc: "Bol de 14 cm, émail céladon craquelé." },
  { title: "Assiette Nuit", hue: 222, price: 3200, stock: 4, cols: ["assiettes"], desc: "Assiette plate de 26 cm, émail bleu profond." },
  { title: "Vase Galet", hue: 12, price: 4500, stock: 7, cols: ["deco"], desc: "Vase soliflore, hauteur 18 cm." },
  { title: "Coupelle Olive", hue: 78, price: 1400, stock: 40, cols: ["bols"], desc: "Coupelle de 10 cm pour bijoux ou olives." },
  { title: "Théière Brume", hue: 200, price: 8900, stock: 3, cols: ["deco"], desc: "Théière de 80 cl avec filtre intégré." },
];

async function main() {
  await db.user.deleteMany({ where: { email: "demo@comptoir.test" } });
  const p = PRESETS.argile;
  const base = defaultTheme("Atelier Argile");
  const theme: Theme = {
    ...base,
    colors: p.colors,
    font: p.font,
    radius: p.radius,
    announcement: "Livraison offerte dès 60 € d'achat",
    sections: [
      { id: "hero1", type: "hero", title: "Céramiques tournées à la main", subtitle: "Des pièces uniques, cuites en petites séries dans notre atelier de Lyon.", buttonLabel: "Découvrir la collection", buttonLink: "/products", image: null },
      { id: "feat1", type: "featured", title: "Nouveautés", collectionHandle: null, limit: 4 },
      { id: "cols1", type: "collections", title: "Par catégorie" },
      { id: "text1", type: "text", title: "L'atelier", body: "Chaque pièce est tournée, émaillée et cuite à la main. Les petites variations de couleur font partie de leur charme." },
    ],
  };

  const user = await db.user.create({
    data: {
      email: "demo@comptoir.test",
      name: "Sofiane",
      passwordHash: await bcrypt.hash(process.env.SEED_DEMO_PASSWORD || "demo1234", 12),
      stores: { create: { slug: "atelier-argile", name: "Atelier Argile", tagline: "Céramiques artisanales", theme: JSON.stringify(theme), displayCurrencies: JSON.stringify([{ code: "USD", rate: 1.12 }, { code: "MAD", rate: 10.8 }]), legalName: "Atelier Argile (exemple)", legalAddress: "12 rue des Potiers\n69002 Lyon, France", siret: "000 000 000 00000" } },
    },
    include: { stores: true },
  });
  const store = user.stores[0];

  const cols = Object.fromEntries(
    await Promise.all(
      [["tasses", "Tasses"], ["bols", "Bols"], ["assiettes", "Assiettes"], ["deco", "Décoration"], ["promos", "Petits prix"]].map(async ([handle, title]) => [
        handle,
        await db.collection.create({ data: { storeId: store.id, handle, title } }),
      ]),
    ),
  );

  const created = [];
  for (const [i, pr] of PRODUCTS.entries()) {
    created.push(
      await db.product.create({
        data: {
          storeId: store.id,
          title: pr.title,
          handle: pr.title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-"),
          description: pr.desc,
          status: "active",
          hue: pr.hue,
          createdAt: new Date(Date.now() - (PRODUCTS.length - i) * 86400_000),
          variants: { create: [{ title: "Par défaut", priceCents: pr.price, compareAtCents: pr.compare ?? null, stock: pr.stock }] },
          collections: { create: pr.cols.map((c) => ({ collectionId: cols[c].id })) },
        },
        include: { variants: true },
      }),
    );
  }

  // Un produit avec variantes
  const tablier = await db.product.create({
    data: {
      storeId: store.id,
      title: "Tablier d'atelier",
      handle: "tablier-d-atelier",
      description: "Tablier en lin lavé, poche ventrale. Le même que dans l'atelier.",
      status: "active",
      hue: 340,
      options: JSON.stringify([{ name: "Taille", values: ["S", "M", "L"] }, { name: "Couleur", values: ["Sable", "Encre"] }]),
      variants: {
        create: ["S", "M", "L"].flatMap((t, ti) => ["Sable", "Encre"].map((c, ci) => ({ title: `${t} / ${c}`, optionValues: JSON.stringify([t, c]), priceCents: 3900, stock: t === "L" && c === "Encre" ? 0 : 6, position: ti * 2 + ci }))),
      },
      collections: { create: [{ collectionId: cols.deco.id }] },
    },
    include: { variants: true },
  });

  await db.discount.create({ data: { storeId: store.id, code: "BIENVENUE10", type: "percent", value: 10 } });
  await seedShipping(db, store.id);
  await seedReviews(db, store.id);
  await seedContent(db, store.id);
  await seedGiftAndAuto(db, store.id);
  await seedBundle(db, store.id);
  for (const email of ["lea@exemple.fr", "sophie@exemple.fr", "ines@exemple.fr"]) {
    await db.customer.updateMany({ where: { storeId: store.id, email }, data: { acceptsMarketing: true, subscribedAt: new Date(), marketingToken: `demo-${email.split("@")[0]}` } });
  }
  await seedExtraStores(db, user.id);

  // Commandes d'exemple réparties sur les 3 dernières semaines
  const buyers = [
    ["Léa Martin", "lea@exemple.fr", "Lyon", "69003"],
    ["Karim Benali", "karim@exemple.fr", "Marseille", "13001"],
    ["Sophie Durand", "sophie@exemple.fr", "Nantes", "44000"],
    ["Thomas Petit", "thomas@exemple.fr", "Nice", "06000"],
    ["Inès Moreau", "ines@exemple.fr", "Bordeaux", "33000"],
  ];
  const all = [...created, tablier];
  for (let n = 0; n < 14; n++) {
    const [name, email, city, zip] = buyers[n % buyers.length];
    const picks = [all[n % all.length], all[(n * 3 + 1) % all.length]].slice(0, 1 + (n % 2));
    const items = picks.map((pr) => ({ v: pr.variants[n % pr.variants.length], pr, q: 1 + (n % 3 === 0 ? 1 : 0) }));
    const subtotal = items.reduce((s, i) => s + i.v.priceCents * i.q, 0);
    const shipping = subtotal >= 6000 ? 0 : 490;
    const customer = await db.customer.upsert({ where: { storeId_email: { storeId: store.id, email } }, update: {}, create: { storeId: store.id, email, name } });
    const createdAt = new Date(Date.now() - (20 - n * 1.4) * 86400_000);
    await db.order.create({
      data: {
        storeId: store.id,
        number: 1001 + n,
        customerId: customer.id,
        email,
        name,
        address: JSON.stringify({ line1: `${3 + n} rue de la République`, zip, city, country: "France" }),
        paymentStatus: "paid",
        paidAt: createdAt,
        fulfillmentStatus: n < 10 ? "fulfilled" : "unfulfilled",
        subtotalCents: subtotal,
        shippingCents: shipping,
        totalCents: subtotal + shipping,
        createdAt,
        items: { create: items.map((i) => ({ variantId: i.v.id, productTitle: i.pr.title, variantTitle: i.v.title, priceCents: i.v.priceCents, quantity: i.q, hue: i.pr.hue })) },
      },
    });
  }
  console.log("Boutique de démonstration créée : /s/atelier-argile");
}

if (require.main === module) main().finally(() => db.$disconnect());

export async function seedShipping(client: PrismaClient, storeId: string) {
  await client.shippingZone.create({
    data: {
      storeId, name: "France", countries: JSON.stringify(["France", "Monaco"]),
      rates: { create: [{ name: "Colissimo", priceCents: 490, freeAboveCents: 6000, position: 0 }, { name: "Express 24 h", priceCents: 990, position: 1 }] },
    },
  });
  await client.shippingZone.create({
    data: {
      storeId, name: "Europe", countries: JSON.stringify(["Belgique", "Suisse", "Luxembourg", "Allemagne", "Espagne", "Italie", "Pays-Bas", "Portugal"]),
      rates: { create: [{ name: "Standard international", priceCents: 1290, freeAboveCents: 12000, position: 0 }] },
    },
  });
}

export async function seedReviews(client: PrismaClient, storeId: string) {
  const byHandle = async (h: string) => (await client.product.findFirst({ where: { storeId, handle: h } }))?.id;
  const R = [
    ["tasse-gres-sable", "Léa", "lea@exemple.fr", 5, "Parfaite pour le café du matin", "Très belle finition, la couleur sable est encore plus jolie en vrai.", true, "published"],
    ["tasse-gres-sable", "Karim", "karim@exemple.fr", 4, "", "Bonne tenue en main, un peu plus petite que je pensais.", false, "published"],
    ["bol-celadon", "Sophie", "sophie@exemple.fr", 5, "Magnifique", "L'émail craquelé est superbe. Emballage très soigné.", true, "published"],
    ["theiere-brume", "Thomas", "thomas@exemple.fr", 5, "Coup de cœur", "Le filtre est pratique et la théière verse sans couler.", true, "published"],
    ["vase-galet", "Inès", "ines@exemple.fr", 3, "Joli mais fragile", "Le vase est beau mais arrivé avec un petit éclat, le service client a été réactif.", false, "pending"],
  ] as const;
  for (const [h, name, email, rating, title, body, verified, status] of R) {
    const productId = await byHandle(h);
    if (productId) await client.review.create({ data: { storeId, productId, name, email, rating, title, body, verified, status } });
  }
}

/** Deux boutiques de plus pour le compte de démo, avec des ventes sur 30 jours (vue « Toutes les boutiques »). */
export async function seedExtraStores(client: PrismaClient, ownerId: string) {
  const SHOPS = [
    { slug: "maison-lin", name: "Maison Lin", preset: "papier", products: [["Nappe en lin", 6900, 5], ["Torchons (lot de 3)", 2400, 140], ["Housse de coussin", 3200, 320], ["Tablier en lin", 3900, 25]] },
    { slug: "the-et-co", name: "Thé & Co", preset: "minuit", products: [["Thé vert Sencha 100 g", 1290, 120], ["Rooibos vanille 100 g", 990, 20], ["Coffret découverte", 3490, 200], ["Théière en fonte", 5900, 260]] },
  ] as const;
  const names = [["Julie Bernard", "julie@exemple.fr"], ["Marc Lefèvre", "marc@exemple.fr"], ["Amina Diallo", "amina@exemple.fr"], ["Hugo Roux", "hugo@exemple.fr"], ["Clara Fontaine", "clara@exemple.fr"]];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (const shop of SHOPS) {
    await client.store.deleteMany({ where: { slug: shop.slug } });
    const p = PRESETS[shop.preset];
    const theme: Theme = { ...defaultTheme(shop.name), colors: p.colors, font: p.font, radius: p.radius };
    const store = await client.store.create({ data: { slug: shop.slug, name: shop.name, ownerId, theme: JSON.stringify(theme) } });
    const products = [];
    for (const [title, price, hue] of shop.products) {
      products.push(await client.product.create({
        data: { storeId: store.id, title, handle: title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), status: "active", hue, variants: { create: [{ title: "Par défaut", priceCents: price, stock: 50 }] } },
        include: { variants: true },
      }));
    }
    let number = 1001;
    for (let day = 29; day >= 0; day--) {
      const perDay = Math.floor(rnd() * 4);
      for (let k = 0; k < perDay; k++) {
        const [name, email] = names[Math.floor(rnd() * names.length)];
        const pr = products[Math.floor(rnd() * products.length)];
        const q = 1 + Math.floor(rnd() * 2);
        const sub = pr.variants[0].priceCents * q, ship = sub >= 6000 ? 0 : 490;
        const createdAt = new Date(Date.now() - day * 86400_000 - Math.floor(rnd() * 8) * 3600_000);
        const customer = await client.customer.upsert({ where: { storeId_email: { storeId: store.id, email } }, update: {}, create: { storeId: store.id, email, name } });
        await client.order.create({
          data: {
            storeId: store.id, number: number++, customerId: customer.id, email, name,
            address: JSON.stringify({ line1: "8 rue de la Paix", zip: "75002", city: "Paris", country: "France" }),
            paymentStatus: "paid", paidAt: createdAt, fulfillmentStatus: day > 2 ? "fulfilled" : "unfulfilled",
            subtotalCents: sub, shippingCents: ship, totalCents: sub + ship, createdAt,
            items: { create: [{ variantId: pr.variants[0].id, productTitle: pr.title, variantTitle: "Par défaut", priceCents: pr.variants[0].priceCents, quantity: q, hue: pr.hue }] },
          },
        });
      }
    }
  }
}

export async function seedContent(client: PrismaClient, storeId: string) {
  await client.page.createMany({
    data: [
      { storeId, handle: "a-propos", title: "À propos", body: "## L'atelier\n\nAtelier Argile est né en 2019 dans un petit atelier de Lyon. Chaque pièce est **tournée, émaillée et cuite à la main**, en petites séries.\n\n## Nos engagements\n\n- Des argiles et des émaux sans plomb\n- Des cuissons groupées pour économiser l'énergie\n- Des emballages recyclés" },
      { storeId, handle: "livraison-et-retours", title: "Livraison et retours", body: "## Livraison\n\nNous expédions sous 2 jours ouvrés en Colissimo. La livraison est **offerte dès 60 €** en France.\n\n## Retours\n\nVous avez 14 jours pour changer d'avis. Écrivez-nous et nous vous enverrons une étiquette de retour." },
      { storeId, handle: "cgv", title: "Conditions générales de vente", body: "## Article 1 : Objet\n\nLes présentes conditions régissent les ventes réalisées sur la boutique Atelier Argile.\n\n(Exemple à remplacer par vos propres CGV.)" },
    ],
  });
  await client.blogPost.create({
    data: {
      storeId, handle: "entretenir-vos-ceramiques", title: "Comment entretenir vos céramiques", author: "Sofiane", published: true, publishedAt: new Date(Date.now() - 5 * 86400_000),
      excerpt: "Lave-vaisselle, micro-ondes, taches de thé : nos conseils pour que vos pièces durent des années.",
      body: "Le grès émaillé est une matière solide, mais quelques gestes simples prolongent sa vie.\n\n## Au quotidien\n\n- Le lave-vaisselle convient, en programme doux\n- Évitez les chocs thermiques : pas de tasse froide directement dans l'eau bouillante\n- Pour les taches de thé, un peu de bicarbonate suffit\n\n## Et si une pièce s'ébrèche ?\n\nÉcrivez-nous : nous vous dirons si elle peut être réparée. Découvrez aussi [nos nouveautés](/s/atelier-argile/products).",
    },
  });
}

export async function seedGiftAndAuto(client: PrismaClient, storeId: string) {
  await client.product.create({
    data: {
      storeId, title: "Carte cadeau", handle: "carte-cadeau", status: "active", hue: 45, isGiftCard: true,
      description: "Offrez le choix : une carte cadeau envoyée par e-mail, utilisable sur toute la boutique.",
      options: JSON.stringify([{ name: "Montant", values: ["25 €", "50 €", "100 €"] }]),
      variants: { create: [[2500, "25 €"], [5000, "50 €"], [10000, "100 €"]].map(([p, t], i) => ({ title: String(t), optionValues: JSON.stringify([t]), priceCents: Number(p), stock: 0, position: i })) },
    },
  });
  await client.discount.create({ data: { storeId, code: "AUTO-DEMO", automatic: true, title: "−10 % dès 100 €", type: "percent", value: 10, minSubtotalCents: 10000 } });
  await client.discount.create({ data: { storeId, code: "LIVRAISON", type: "free_shipping", value: 0 } });
}

export async function seedBundle(client: PrismaClient, storeId: string) {
  const v = async (h: string) => (await client.variant.findFirst({ where: { product: { storeId, handle: h } } }))!.id;
  await client.product.create({
    data: {
      storeId, title: "Coffret thé", handle: "coffret-the", status: "active", hue: 260, description: "La théière Brume et deux tasses en grès, à prix doux.",
      variants: { create: [{ title: "Par défaut", priceCents: 9900, compareAtCents: 13300, stock: 0 }] },
      bundleItems: { create: [{ variantId: await v("theiere-brume"), quantity: 1 }, { variantId: await v("tasse-gres-sable"), quantity: 2 }] },
    },
  });
}
