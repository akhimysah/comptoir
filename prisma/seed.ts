/**
 * Boutique de démonstration « Atelier Argile ».
 * Compte marchand de test : demo@comptoir.test / demo1234
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
      passwordHash: await bcrypt.hash("demo1234", 12),
      stores: { create: { slug: "atelier-argile", name: "Atelier Argile", tagline: "Céramiques artisanales", theme: JSON.stringify(theme) } },
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

main().finally(() => db.$disconnect());
