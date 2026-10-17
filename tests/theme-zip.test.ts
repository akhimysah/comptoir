import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { storeUpdateFromFiles } from "@/lib/theme-files";
import { buildThemeZip, readThemeZip } from "@/lib/theme-zip";
import { defaultTheme } from "@/lib/theme";

/** Thème en .zip : export, import, et zips piégés. */
const store = { theme: JSON.stringify({ ...defaultTheme("Atelier"), announcement: "Soldes" }), name: "Atelier", customCss: "h1 { color: red; }", translations: JSON.stringify({ en: { announcement: "Sale" } }) };

describe("thème en .zip", () => {
  it("relit exactement le thème qu'il a exporté", () => {
    const read = readThemeZip(buildThemeZip(store));
    if ("error" in read) throw new Error(read.error);
    const { data, error } = storeUpdateFromFiles({ translations: "{}" }, read.files);
    expect(error).toBeUndefined();
    expect(JSON.parse(data.theme!).announcement).toBe("Soldes");
    expect(data.customCss).toBe("h1 { color: red; }");
    expect(JSON.parse(data.translations!).en.announcement).toBe("Sale");
  });

  it("accepte un dossier compressé et ignore les fichiers cachés de macOS", () => {
    const zip = zipSync({ "mon-theme/theme.json": strToU8(store.theme), "__MACOSX/mon-theme/._theme.json": strToU8("x"), "mon-theme/notes.txt": strToU8("ok") });
    const read = readThemeZip(zip);
    expect("files" in read && JSON.parse(read.files["theme.json"]!).announcement).toBe("Soldes");
  });

  it("refuse un fichier qui n'est pas un .zip, un zip sans theme.json et un fichier énorme", () => {
    expect(readThemeZip(strToU8("bonjour"))).toEqual({ error: "Ce fichier n'est pas un .zip." });
    expect("error" in readThemeZip(zipSync({ "autre.json": strToU8("{}") }))).toBe(true);
    const bomb = zipSync({ "theme.json": new Uint8Array(600 * 1024).fill(32) }, { level: 9 }); // très compressible
    expect(bomb.length).toBeLessThan(10_000);
    expect(readThemeZip(bomb)).toEqual({ error: "theme.json est trop lourd (512 Ko maximum)." });
  });

  it("ignore les chemins qui sortent du dossier", () => {
    const read = readThemeZip(zipSync({ "../theme.json": strToU8(store.theme) }));
    expect("error" in read).toBe(true);
  });
});
