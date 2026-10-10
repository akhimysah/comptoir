import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { forgetDomain, normalizeDomain, storeBase } from "@/lib/domains";
import { proxy } from "@/proxy";

/** Noms de domaine personnalisés : saisie, et aiguillage des requêtes vers la bonne boutique. */
let slug: string;
const req = (host: string, path: string, method = "GET") => new NextRequest(`http://${host}${path}`, { method, headers: { host } });

beforeEach(async () => {
  await db.user.deleteMany();
  const owner = await db.user.create({ data: { email: `dom-${Date.now()}@test.local`, name: "Marchand", passwordHash: "x" } });
  slug = `dom-${Date.now()}`;
  await db.store.create({ data: { ownerId: owner.id, name: "Boutique", slug, theme: "{}", domain: "www.argile-test.fr", domainToken: "t", domainVerifiedAt: new Date() } });
  await db.store.create({ data: { ownerId: owner.id, name: "Non vérifiée", slug: `${slug}-b`, theme: "{}", domain: "www.pas-verifie.fr", domainToken: "t" } });
  forgetDomain("www.argile-test.fr");
  forgetDomain("www.pas-verifie.fr");
});

describe("noms de domaine", () => {
  it("normalise la saisie et refuse les adresses invalides", () => {
    expect(normalizeDomain("https://WWW.MaBoutique.fr/accueil")).toBe("www.maboutique.fr");
    expect(normalizeDomain("maboutique.fr.")).toBe("maboutique.fr");
    for (const bad of ["localhost", "127.0.0.1", "pas un domaine", "x", "boutique.vercel.app", "-a.fr"]) expect(normalizeDomain(bad)).toBeNull();
  });

  it("sert la boutique à la racine de son domaine vérifié", async () => {
    const res = await proxy(req("www.argile-test.fr", "/p/bol?variant=1"));
    expect(res.headers.get("x-middleware-rewrite")).toBe(`http://www.argile-test.fr/s/${slug}/p/bol?variant=1`);
    const home = await proxy(req("www.argile-test.fr", "/"));
    expect(home.headers.get("x-middleware-rewrite")).toBe(`http://www.argile-test.fr/s/${slug}`);
  });

  it("redirige les anciennes adresses vers l'adresse courte, sans toucher aux fichiers communs", async () => {
    const res = await proxy(req("www.argile-test.fr", `/s/${slug}/c/bols`));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("http://www.argile-test.fr/c/bols");
    expect((await proxy(req("www.argile-test.fr", "/api/cart", "POST"))).headers.get("x-middleware-rewrite")).toBeNull();
    expect((await proxy(req("www.argile-test.fr", "/uploads/photo.jpg"))).headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("ne sert ni une autre boutique, ni l'admin, ni un domaine non vérifié", async () => {
    expect((await proxy(req("www.argile-test.fr", "/s/autre-boutique"))).status).toBe(404);
    expect((await proxy(req("www.argile-test.fr", "/admin"))).status).toBe(404);
    expect((await proxy(req("www.pas-verifie.fr", "/p/bol"))).headers.get("x-middleware-rewrite")).toBeNull();
    expect(storeBase({ slug: "x", domain: "www.pas-verifie.fr", domainVerifiedAt: null })).toMatch(/\/s\/x$/);
  });
});
