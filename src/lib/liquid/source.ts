import "server-only";
import { db } from "../db";
import type { ThemeSource } from "./types";

/** Dossiers d'un thème Shopify et types de fichiers acceptés à l'import. */
export const THEME_DIRS = ["layout", "templates", "sections", "snippets", "config", "locales", "assets", "blocks"] as const;
const TEXT_EXT = /\.(liquid|json|css|js|mjs|svg|txt|md|map|html|xml|csv|vtt|webmanifest)$/i;
const BINARY_EXT = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|ogg|pdf)$/i;
export const IMPORT_LIMITS = { files: 2500, totalBytes: 60 * 1024 * 1024, fileBytes: 8 * 1024 * 1024, batchBytes: 3_500_000 };

const MIME: Record<string, string> = { css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", json: "application/json; charset=utf-8", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", eot: "application/vnd.ms-fontobject", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", ogg: "audio/ogg", pdf: "application/pdf", txt: "text/plain; charset=utf-8", html: "text/html; charset=utf-8", xml: "application/xml", vtt: "text/vtt", webmanifest: "application/manifest+json", liquid: "text/plain; charset=utf-8", map: "application/json" };
export const contentTypeOf = (path: string) => MIME[path.split(".").pop()!.toLowerCase()] ?? "application/octet-stream";

/**
 * Chemin accepté dans un thème : un des dossiers connus, pas de remontée, nom simple.
 * Renvoie le chemin normalisé (sans dossier parent éventuel du zip) ou null.
 */
export function themePath(raw: string): string | null {
  const p = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (p.includes("..") || p.includes("__MACOSX") || p.split("/").pop()!.startsWith(".")) return null;
  const parts = p.split("/");
  // Le zip peut contenir un dossier racine : on garde à partir du dossier de thème connu.
  const i = parts.findIndex((x) => (THEME_DIRS as readonly string[]).includes(x));
  if (i < 0 || i === parts.length - 1) return null;
  const rel = parts.slice(i).join("/");
  if (rel.length > 300 || !/^[\w./@ ()+,'-]+$/.test(rel)) return null;
  const dir = parts[i];
  if (dir === "assets") return TEXT_EXT.test(rel) || BINARY_EXT.test(rel) ? rel : null;
  if (parts.length - i !== 2 && !(dir === "locales" || dir === "templates")) return null; // sous-dossiers : seulement templates/customers et locales
  return /\.(liquid|json)$/i.test(rel) ? rel : null;
}
export const isTextPath = (p: string) => TEXT_EXT.test(p) || /\.(liquid|json)$/i.test(p);

/** Un dossier décompressé est un thème Shopify s'il a une mise en page et une configuration. */
export const looksLikeShopifyTheme = (paths: string[]) => paths.some((p) => /(^|\/)layout\/theme\.liquid$/.test(p)) && paths.some((p) => /(^|\/)config\/settings_schema\.json$/.test(p));

type ThemeRef = { id: string; version: number };
const listings = new Map<string, { until: number; paths: string[] }>();

/** Fichiers du thème lus dans la base, listing gardé une minute par version. */
export function dbThemeSource(theme: ThemeRef, root: string): ThemeSource {
  const key = `${theme.id}:${theme.version}`;
  const list = async () => {
    const hit = listings.get(key);
    if (hit && hit.until > Date.now()) return hit.paths;
    const rows = await db.themeFile.findMany({ where: { themeId: theme.id }, select: { path: true } });
    const paths = rows.map((r) => r.path).sort();
    if (listings.size > 200) listings.clear();
    listings.set(key, { until: Date.now() + 60_000, paths });
    return paths;
  };
  return {
    id: theme.id,
    version: String(theme.version),
    async get(path) {
      const row = await db.themeFile.findUnique({ where: { themeId_path: { themeId: theme.id, path } }, select: { text: true, bytes: true } });
      if (!row) return null;
      return row.text ?? (row.bytes ? Buffer.from(row.bytes).toString("utf8") : "");
    },
    async list(prefix) { return (await list()).filter((p) => p.startsWith(prefix)); },
    // L'identifiant du thème voyage avec l'adresse : les fichiers d'un brouillon en aperçu (?pt=) se servent sans cookie.
    assetUrl(name) { return `${root}/assets/${encodeURIComponent(name).replace(/%2F/g, "/")}?v=${theme.version}&t=${theme.id}`; },
  };
}

/** Fichier brut d'un thème (service des assets) ; « p_<id> » désigne un thème de la bibliothèque de la plateforme. */
export async function themeFile(themeId: string, path: string) {
  if (themeId.startsWith("p_")) return db.platformThemeFile.findUnique({ where: { themeId_path: { themeId: themeId.slice(2), path } } });
  return db.themeFile.findUnique({ where: { themeId_path: { themeId, path } } });
}

/** Thème de la bibliothèque de la plateforme lu directement (aperçu dans la galerie, avant installation). */
export function platformThemeSource(theme: ThemeRef, root: string): ThemeSource {
  const key = `p_${theme.id}:${theme.version}`;
  const list = async () => {
    const hit = listings.get(key);
    if (hit && hit.until > Date.now()) return hit.paths;
    const paths = (await db.platformThemeFile.findMany({ where: { themeId: theme.id }, select: { path: true } })).map((r) => r.path).sort();
    listings.set(key, { until: Date.now() + 60_000, paths });
    return paths;
  };
  return {
    id: `p_${theme.id}`,
    version: String(theme.version),
    async get(path) { const row = await db.platformThemeFile.findUnique({ where: { themeId_path: { themeId: theme.id, path } }, select: { text: true, bytes: true } }); return row ? row.text ?? (row.bytes ? Buffer.from(row.bytes).toString("utf8") : "") : null; },
    async list(prefix) { return (await list()).filter((p) => p.startsWith(prefix)); },
    assetUrl(name) { return `${root}/assets/${encodeURIComponent(name).replace(/%2F/g, "/")}?v=${theme.version}&t=p_${theme.id}`; },
  };
}

/** Enregistre un lot de fichiers importés (création ou remplacement), dans un thème de boutique ou de la plateforme. */
export async function putThemeFiles(themeId: string, files: { path: string; data: Uint8Array }[], table: "store" | "platform" = "store") {
  for (const f of files) {
    const text = isTextPath(f.path) ? Buffer.from(f.data).toString("utf8") : null;
    const data = { contentType: contentTypeOf(f.path), size: f.data.length, text, bytes: text === null ? Buffer.from(f.data) : null };
    if (table === "platform") await db.platformThemeFile.upsert({ where: { themeId_path: { themeId, path: f.path } }, create: { themeId, path: f.path, ...data }, update: data });
    else await db.themeFile.upsert({ where: { themeId_path: { themeId, path: f.path } }, create: { themeId, path: f.path, ...data }, update: data });
  }
}

/** Installe un thème de la plateforme dans une boutique : copie de tous ses fichiers dans un nouveau brouillon. */
export async function installPlatformTheme(storeId: string, platformThemeId: string, name: string, keepFrom?: string) {
  const [platform, files] = await Promise.all([
    db.platformTheme.findUnique({ where: { id: platformThemeId }, select: { version: true } }),
    db.platformThemeFile.findMany({ where: { themeId: platformThemeId, NOT: { path: "thumbnail.png" } }, select: { path: true, text: true, bytes: true, contentType: true, size: true } }),
  ]);
  const row = await db.storeTheme.create({ data: { storeId, name, theme: "{}", source: "preset", engine: "liquid", platformThemeId, platformVersion: platform?.version ?? "" } });
  for (let i = 0; i < files.length; i += 100) await db.themeFile.createMany({ data: files.slice(i, i + 100).map((f) => ({ ...f, themeId: row.id })) });
  // Mise à jour : les réglages et gabarits personnalisés de l'ancien thème sont reportés (comme Shopify conserve les réglages).
  if (keepFrom) {
    const kept = await db.themeFile.findMany({ where: { themeId: keepFrom, OR: [{ path: "config/settings_data.json" }, { path: { startsWith: "templates/" }, text: { not: null } }, { path: { startsWith: "sections/" }, AND: { path: { endsWith: ".json" } } }] } });
    const paths = new Set(files.map((f) => f.path));
    const data = kept.filter((f) => f.text !== null && (paths.has(f.path) || f.path.startsWith("templates/"))).map((f) => ({ path: f.path, data: new TextEncoder().encode(f.text!) }));
    await putThemeFiles(row.id, data);
  }
  return row;
}

/** Source avec des fichiers remplacés en mémoire (aperçu en direct de l'éditeur, avant enregistrement). */
export function overlaySource(base: ThemeSource, overrides: Record<string, string>): ThemeSource {
  const keys = Object.keys(overrides);
  let h = 5381;
  for (const k of keys) for (const ch of k + "\0" + overrides[k]) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return {
    id: base.id,
    version: `${base.version ?? "0"}+${(h >>> 0).toString(36)}`,
    async get(p) { return p in overrides ? overrides[p] : base.get(p); },
    async list(prefix) { return [...new Set([...(await base.list(prefix)), ...keys.filter((k) => k.startsWith(prefix))])].sort(); },
    assetUrl: (name) => base.assetUrl(name),
  };
}

/**
 * Un thème exporté depuis une boutique Shopify garde des adresses figées de son CDN
 * (« //cdn.shopify.com/s/files/…/assets/vendor.min.js?v=… », y compris dans les `import` des fichiers JS).
 * Elles sont ramenées vers nos fichiers du thème.
 */
export function rewriteShopifyCdn(text: string, theme: ThemeRef, root: string) {
  return text.replace(/(?:https?:)?\/\/cdn\.shopify\.com\/s\/files\/[^"'()\s]*?\/assets\/([\w.@-]+)(?:\?[\w=&.-]*)?/g, (_, name: string) => `${root}/assets/${name}?v=${theme.version}&t=${theme.id}`);
}
