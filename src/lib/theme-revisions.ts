import "server-only";
import type { StoreTheme } from "@prisma/client";
import { db } from "./db";
import { themeFiles, THEME_FILES, storeUpdateFromFiles } from "./theme-files";
import { putThemeFiles } from "./liquid/source";

const MAX_REVISIONS = 60;

/** Contenu actuel d'un fichier : thème Shopify (ThemeFile) ou thème natif (theme.json, custom.css, locales/en.json). */
async function currentContent(theme: StoreTheme, path: string, storeName: string): Promise<string | null> {
  if (theme.engine === "liquid") {
    const row = await db.themeFile.findUnique({ where: { themeId_path: { themeId: theme.id, path } }, select: { text: true } });
    return row?.text ?? null;
  }
  return themeFiles({ ...theme, name: storeName })[path] ?? null;
}

/** À appeler avant d'écrire : garde l'état précédent des fichiers qui vont changer. */
export async function recordRevision(theme: StoreTheme, storeName: string, label: string, paths: string[], userName = "") {
  const entries: { path: string; before: string | null }[] = [];
  for (const path of [...new Set(paths)]) entries.push({ path, before: await currentContent(theme, path, storeName) });
  if (!entries.length) return null;
  const rev = await db.themeRevision.create({ data: { themeId: theme.id, label: label.slice(0, 120), userName: userName.slice(0, 80), entries: { create: entries } } });
  // Au-delà de la limite, les versions les plus anciennes disparaissent.
  const old = await db.themeRevision.findMany({ where: { themeId: theme.id }, orderBy: { createdAt: "desc" }, skip: MAX_REVISIONS, select: { id: true } });
  if (old.length) await db.themeRevision.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  return rev;
}

export async function listRevisions(themeId: string) {
  return db.themeRevision.findMany({ where: { themeId }, orderBy: { createdAt: "desc" }, include: { entries: { select: { path: true } } } });
}

/**
 * Revient à l'état d'avant une version donnée : les versions plus récentes (et celle-ci) sont rejouées à l'envers.
 * Le retour est lui-même enregistré comme une version, donc annulable.
 */
export async function restoreRevision(theme: StoreTheme, storeName: string, revisionId: string, userName = ""): Promise<{ error?: string; ok?: boolean }> {
  const target = await db.themeRevision.findFirst({ where: { id: revisionId, themeId: theme.id } });
  if (!target) return { error: "Version introuvable." };
  const newer = await db.themeRevision.findMany({ where: { themeId: theme.id, createdAt: { gte: target.createdAt } }, orderBy: { createdAt: "desc" }, include: { entries: true } });
  // État à rétablir par fichier : la valeur « avant » la plus ancienne parmi les versions rejouées.
  const restore = new Map<string, string | null>();
  for (const rev of newer) for (const e of rev.entries) restore.set(e.path, e.before);
  if (!restore.size) return { ok: true };
  await recordRevision(theme, storeName, `Retour à la version du ${target.createdAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}`, [...restore.keys()], userName);
  if (theme.engine === "liquid") {
    const write = [...restore].filter(([, v]) => v !== null).map(([path, v]) => ({ path, data: new TextEncoder().encode(v!) }));
    const remove = [...restore].filter(([, v]) => v === null).map(([path]) => path);
    if (write.length) await putThemeFiles(theme.id, write);
    if (remove.length) await db.themeFile.deleteMany({ where: { themeId: theme.id, path: { in: remove } } });
    await db.storeTheme.update({ where: { id: theme.id }, data: { version: { increment: 1 } } });
  } else {
    const files: Partial<Record<string, string>> = {};
    for (const [path, v] of restore) if ((Object.values(THEME_FILES) as string[]).includes(path) && v !== null) files[path] = v;
    const { data, error } = storeUpdateFromFiles(theme, files);
    if (error) return { error };
    await db.storeTheme.update({ where: { id: theme.id }, data });
  }
  return { ok: true };
}
