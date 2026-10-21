/** ThemeSource en mémoire (tests) et sur disque (thèmes réels via LIQUID_FIXTURES). */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ThemeSource } from "@/lib/liquid/types";

/** Empreinte du contenu : la version du cache moteur doit changer dès qu'un fichier change. */
function fingerprint(files: Record<string, string>): string {
  let h = 5381;
  for (const [k, v] of Object.entries(files)) for (const ch of k + "\0" + v + "\0") h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return `${Object.keys(files).length}-${(h >>> 0).toString(36)}`;
}

export function memorySource(files: Record<string, string>, id = "mem"): ThemeSource {
  return {
    id,
    version: fingerprint(files),
    async get(p) {
      return files[p] ?? null;
    },
    async list(prefix) {
      return Object.keys(files).filter((k) => k.startsWith(prefix));
    },
    assetUrl(name) {
      return `/s/demo/assets/${name}`;
    },
  };
}

async function walk(dir: string, base = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "__MACOSX") continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(path.join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out;
}

/** Racine réelle d'un thème : le dossier qui contient layout/ (les zips ont parfois un sous-dossier). */
export async function findThemeRoot(dir: string): Promise<string | null> {
  try {
    if ((await stat(path.join(dir, "layout"))).isDirectory()) return dir;
  } catch {
    /* pas ici */
  }
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "__MACOSX" || entry.name.startsWith(".")) continue;
    const found = await findThemeRoot(path.join(dir, entry.name));
    if (found) return found;
  }
  return null;
}

export async function fsSource(root: string): Promise<ThemeSource> {
  const files = await walk(root);
  const set = new Set(files);
  return {
    id: root,
    version: String(files.length),
    async get(p) {
      if (!set.has(p)) return null;
      return readFile(path.join(root, p), "utf8");
    },
    async list(prefix) {
      return files.filter((f) => f.startsWith(prefix));
    },
    assetUrl(name) {
      return `/s/demo/assets/${name}`;
    },
  };
}
