import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { putThemeFiles } from "@/lib/liquid/source";
import { listRevisions, recordRevision, restoreRevision } from "@/lib/theme-revisions";
import { defaultTheme } from "@/lib/theme";

/** Historique des versions d'un thème : chaque enregistrement garde l'état d'avant, et on peut y revenir. */
let storeId: string;
beforeEach(async () => {
  await db.user.deleteMany();
  const owner = await db.user.create({ data: { email: `rev-${Date.now()}@test.local`, name: "Marchand", passwordHash: "x" } });
  storeId = (await db.store.create({ data: { ownerId: owner.id, name: "Boutique", slug: `rev-${Date.now()}`, theme: "{}" } })).id;
});

describe("historique des versions", () => {
  it("thème Shopify : revenir avant une version rétablit les fichiers, fichier créé compris", async () => {
    const theme = await db.storeTheme.create({ data: { storeId, name: "Shop", theme: "{}", engine: "liquid" } });
    await putThemeFiles(theme.id, [{ path: "templates/index.json", data: new TextEncoder().encode('{"v":1}') }]);
    await recordRevision(theme, "Boutique", "Enregistrement 1", ["templates/index.json", "sections/new.json"], "Léa");
    await putThemeFiles(theme.id, [{ path: "templates/index.json", data: new TextEncoder().encode('{"v":2}') }, { path: "sections/new.json", data: new TextEncoder().encode("{}") }]);
    await recordRevision(theme, "Boutique", "Enregistrement 2", ["templates/index.json"]);
    await putThemeFiles(theme.id, [{ path: "templates/index.json", data: new TextEncoder().encode('{"v":3}') }]);
    const revs = await listRevisions(theme.id);
    expect(revs.map((r) => r.label)).toEqual(["Enregistrement 2", "Enregistrement 1"]);
    // Retour avant « Enregistrement 1 » : index v1, le fichier créé disparaît.
    expect((await restoreRevision(theme, "Boutique", revs[1].id)).ok).toBe(true);
    const index = await db.themeFile.findUnique({ where: { themeId_path: { themeId: theme.id, path: "templates/index.json" } } });
    expect(index?.text).toBe('{"v":1}');
    expect(await db.themeFile.findUnique({ where: { themeId_path: { themeId: theme.id, path: "sections/new.json" } } })).toBeNull();
    // Le retour est lui-même une version : on peut le défaire et retrouver v3.
    const after = await listRevisions(theme.id);
    expect(after[0].label).toMatch(/Retour/);
    expect((await restoreRevision(theme, "Boutique", after[0].id)).ok).toBe(true);
    expect((await db.themeFile.findUnique({ where: { themeId_path: { themeId: theme.id, path: "templates/index.json" } } }))?.text).toBe('{"v":3}');
  });

  it("thème natif : theme.json revient à son état précédent", async () => {
    const theme = await db.storeTheme.create({ data: { storeId, name: "Natif", theme: JSON.stringify({ ...defaultTheme("Boutique"), announcement: "Avant" }) } });
    await recordRevision(theme, "Boutique", "Enregistrement", ["theme.json"]);
    await db.storeTheme.update({ where: { id: theme.id }, data: { theme: JSON.stringify({ ...defaultTheme("Boutique"), announcement: "Après" }) } });
    const rev = (await listRevisions(theme.id))[0];
    const current = (await db.storeTheme.findUniqueOrThrow({ where: { id: theme.id } }));
    expect((await restoreRevision(current, "Boutique", rev.id)).ok).toBe(true);
    expect(JSON.parse((await db.storeTheme.findUniqueOrThrow({ where: { id: theme.id } })).theme).announcement).toBe("Avant");
  });
});
