import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { normalizePath, safeUrl } from "@/lib/navigation";
import { base32Encode, hashRecovery, hotp, matchStep } from "@/lib/totp";
import { safeNext } from "@/lib/utils";

describe("double authentification (RFC 6238)", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("donne les codes des vecteurs officiels", () => {
    for (const [t, code] of [[59, "287082"], [1111111109, "081804"], [1234567890, "005924"], [2000000000, "279037"]] as const) {
      expect(hotp(secret, Math.floor(t / 30))).toBe(code);
    }
  });
  it("accepte le code courant et un pas de décalage, pas plus", () => {
    const now = 1234567890 * 1000;
    const step = Math.floor(now / 30_000);
    expect(matchStep(secret, hotp(secret, step), now)).toBe(step);
    expect(matchStep(secret, hotp(secret, step - 1), now)).toBe(step - 1);
    expect(matchStep(secret, hotp(secret, step - 3), now)).toBeNull();
    expect(matchStep(secret, "12345", now)).toBeNull();
  });
  it("compare les codes de secours sans tenir compte de la mise en forme", () => {
    expect(hashRecovery("AB12C-3D4E5")).toBe(hashRecovery("ab12c3d4e5"));
  });
});

describe("redirections", () => {
  it("n'envoie jamais vers un autre site après la connexion", () => {
    expect(safeNext("/admin/orders?x=1", "/admin")).toBe("/admin/orders?x=1");
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/\tevil"]) expect(safeNext(bad, "/admin")).toBe("/admin");
  });
  it("refuse les liens de menu dangereux", () => {
    expect(safeUrl("/pages/contact")).toBe("/pages/contact");
    expect(safeUrl("https://instagram.com/boutique")).toBe("https://instagram.com/boutique");
    for (const bad of ["javascript:alert(1)", "//evil.com", "/\\evil", "data:text/html,x"]) expect(safeUrl(bad)).toBeNull();
  });
  it("normalise les chemins des redirections", () => {
    expect(normalizePath("soldes/")).toBe("/soldes");
    expect(normalizePath("/a//b?x=1#y")).toBe("/a/b");
  });
});

describe("exports CSV", () => {
  it("neutralise les formules Excel sans toucher aux nombres", () => {
    const csv = toCsv([["=HYPERLINK(\"x\")", "+33612", "@SUM", "-12,50", "normal", -3]]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+33612");
    expect(csv).toContain("'@SUM");
    expect(csv).toContain(";-12,50;");
    expect(csv).toContain(";-3");
  });
});

describe("suivi des erreurs", () => {
  it("regroupe les erreurs d'une même page quel que soit l'identifiant", async () => {
    const { normalizeErrorPath } = await import("@/lib/errors");
    expect(normalizeErrorPath("/admin/orders/cmv2a6gqp0003soecj8ek507g?x=1")).toBe("/admin/orders/:id");
    expect(normalizeErrorPath("/s/atelier-argile/p/bol-celadon")).toBe("/s/atelier-argile/p/bol-celadon");
  });
});
