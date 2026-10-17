import "server-only";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { Store } from "@prisma/client";
import { THEME_FILES, themeFiles } from "./theme-files";

/** Thème en fichier .zip (comme « Importer un thème » sur Shopify) : mêmes fichiers que la liaison GitHub. */
export const THEME_ZIP_MAX_BYTES = 2 * 1024 * 1024; // taille du .zip déposé
const MAX_ENTRIES = 200;
const MAX_FILE_BYTES = 512 * 1024; // taille décompressée d'un fichier du thème

const README = `Thème Revolution Ecom

theme.json        couleurs, polices, arrondis, bandeau d'annonce et sections de la page d'accueil
custom.css        CSS personnalisé (le HTML, les scripts et @import sont retirés)
locales/en.json   textes traduits en anglais (slogan, bandeau, sections, menus)

Modifiez ces fichiers, recompressez le dossier en .zip et importez-le dans Thème → Fichiers du thème.
`;

export function buildThemeZip(store: Pick<Store, "theme" | "name" | "customCss" | "translations">) {
  const files = themeFiles(store);
  return zipSync({ "README.txt": strToU8(README), ...Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])) }, { level: 6 });
}

/**
 * Lit un .zip de thème. Les fichiers du thème peuvent être à la racine ou dans un dossier (cas d'un dossier compressé).
 * Seuls les fichiers attendus sont lus, avec des limites de taille vérifiées avant décompression.
 */
export function readThemeZip(data: Uint8Array): { files: Partial<Record<string, string>> } | { error: string } {
  if (data.length > THEME_ZIP_MAX_BYTES) return { error: "Fichier trop lourd (2 Mo maximum)." };
  if (data[0] !== 0x50 || data[1] !== 0x4b) return { error: "Ce fichier n'est pas un .zip." };
  const wanted = Object.values(THEME_FILES) as string[];
  let count = 0;
  let tooBig = "";
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data, {
      filter: (f) => {
        count++;
        if (count > MAX_ENTRIES) throw new Error("trop de fichiers");
        const name = f.name.replace(/\\/g, "/");
        // Pas de chemin absolu ni de remontée de dossier ; fichiers cachés de macOS ignorés.
        if (name.startsWith("/") || name.split("/").includes("..") || name.includes("__MACOSX/") || name.split("/").pop()!.startsWith("._")) return false;
        if (!wanted.some((w) => name === w || name.endsWith(`/${w}`))) return false;
        if (f.originalSize > MAX_FILE_BYTES) { tooBig = name; return false; }
        return true;
      },
    });
  } catch (e) {
    return { error: (e as Error).message === "trop de fichiers" ? `Trop de fichiers dans le .zip (${MAX_ENTRIES} maximum).` : "Ce .zip est illisible ou abîmé." };
  }
  if (tooBig) return { error: `${tooBig} est trop lourd (512 Ko maximum).` };
  // Fichier le moins profond pour chaque nom attendu (racine, ou dossier unique compressé).
  const files: Partial<Record<string, string>> = {};
  for (const w of wanted) {
    const match = Object.keys(entries).filter((n) => n.replace(/\\/g, "/") === w || n.replace(/\\/g, "/").endsWith(`/${w}`)).sort((a, b) => a.split("/").length - b.split("/").length)[0];
    if (match) files[w] = strFromU8(entries[match]);
  }
  if (!files[THEME_FILES.theme]) return { error: "theme.json introuvable dans le .zip. Téléchargez le thème actuel pour voir la structure attendue." };
  return { files };
}
