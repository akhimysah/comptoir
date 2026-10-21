import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { logActivity } from "@/lib/activity";
import { requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { IMPORT_LIMITS, putThemeFiles, themePath } from "@/lib/liquid/source";
import { fetchShopifyImageInfo } from "@/lib/image-store";
import { registerMediaFile } from "@/lib/media-files";
import { defaultTheme } from "@/lib/theme";
import { ownTheme, uniqueThemeName } from "@/lib/themes";

/**
 * Import d'un thème Shopify complet. Le navigateur décompresse le .zip et envoie les fichiers par lots
 * (l'hébergeur limite chaque requête à quelques Mo) :
 *   POST ?step=start   { name, files: number, bytes: number }      → { id }
 *   POST ?step=files   multipart : id, puis path[] / file[]          → { ok }
 *   POST ?step=finish  { id }                                        → { ok, url, images?: { base, names } }
 *   POST ?step=images  { id, base, names }                           → { ok, done: number } (photos du marchand récupérées sur le CDN Shopify)
 */
const SHOP_IMAGE = /shopify:\/\/shop_images\/([\w.%@-]+)/g;
const CDN_BASE = /cdn\.shopify\.com\/s\/files\/(\d+\/\d{4}\/\d{4}\/\d{4})\//;
export async function POST(req: Request) {
  const { store } = await requirePerm("content");
  const step = new URL(req.url).searchParams.get("step");
  if (step === "start") {
    const b = (await req.json().catch(() => null)) as { name?: string; files?: number; bytes?: number } | null;
    if (!b || typeof b.files !== "number" || typeof b.bytes !== "number") return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    if (b.files > IMPORT_LIMITS.files) return NextResponse.json({ error: `Trop de fichiers (${IMPORT_LIMITS.files} maximum).` }, { status: 413 });
    if (b.bytes > IMPORT_LIMITS.totalBytes) return NextResponse.json({ error: `Thème trop lourd (${IMPORT_LIMITS.totalBytes / 1048576} Mo maximum une fois décompressé).` }, { status: 413 });
    if ((await db.storeTheme.count({ where: { storeId: store.id } })) >= 20) return NextResponse.json({ error: "20 thèmes au maximum dans la bibliothèque : supprimez-en un d'abord." }, { status: 409 });
    const name = await uniqueThemeName(store.id, String(b.name ?? "").replace(/\.zip$/i, "").replace(/[-_]+/g, " ").trim().slice(0, 60) || "Thème Shopify");
    // Le brouillon n'est visible dans la bibliothèque qu'une fois l'import terminé (engine « importing »).
    const row = await db.storeTheme.create({ data: { storeId: store.id, name, theme: JSON.stringify(defaultTheme(store.name, store.tagline)), source: "zip", engine: "importing" } });
    return NextResponse.json({ id: row.id });
  }
  if (step === "files") {
    const form = await req.formData().catch(() => null);
    const id = String(form?.get("id") ?? "");
    const theme = await ownTheme(store.id, id);
    if (!form || !theme || theme.engine !== "importing") return NextResponse.json({ error: "Import introuvable." }, { status: 404 });
    const paths = form.getAll("path").map(String);
    const blobs = form.getAll("file");
    const files: { path: string; data: Uint8Array }[] = [];
    let bytes = 0;
    for (let i = 0; i < paths.length; i++) {
      const p = themePath(paths[i]);
      const f = blobs[i];
      if (!p || !(f instanceof Blob)) continue;
      if (f.size > IMPORT_LIMITS.fileBytes) return NextResponse.json({ error: `${p} dépasse ${IMPORT_LIMITS.fileBytes / 1048576} Mo.` }, { status: 413 });
      bytes += f.size;
      files.push({ path: p, data: new Uint8Array(await f.arrayBuffer()) });
    }
    const already = await db.themeFile.aggregate({ where: { themeId: id }, _sum: { size: true }, _count: true });
    if ((already._sum.size ?? 0) + bytes > IMPORT_LIMITS.totalBytes || already._count + files.length > IMPORT_LIMITS.files) return NextResponse.json({ error: "Thème trop lourd." }, { status: 413 });
    await putThemeFiles(id, files);
    return NextResponse.json({ ok: true, stored: files.length });
  }
  if (step === "finish") {
    const b = (await req.json().catch(() => null)) as { id?: string } | null;
    const theme = b?.id ? await ownTheme(store.id, b.id) : null;
    if (!theme || theme.engine !== "importing") return NextResponse.json({ error: "Import introuvable." }, { status: 404 });
    const paths = (await db.themeFile.findMany({ where: { themeId: theme.id }, select: { path: true } })).map((f) => f.path);
    if (!paths.includes("layout/theme.liquid") || !paths.includes("config/settings_schema.json")) {
      await db.storeTheme.delete({ where: { id: theme.id } });
      return NextResponse.json({ error: "Ce .zip n'est pas un thème Shopify complet (layout/theme.liquid et config/settings_schema.json attendus)." }, { status: 422 });
    }
    // Nom et version du thème d'après sa fiche (theme_info).
    let name = theme.name;
    try {
      const schema = JSON.parse((await db.themeFile.findUnique({ where: { themeId_path: { themeId: theme.id, path: "config/settings_schema.json" } } }))?.text ?? "[]") as { name?: string; theme_name?: string; theme_version?: string }[];
      const info = schema.find((x) => x.name === "theme_info");
      if (info?.theme_name) name = await uniqueThemeName(store.id, `${info.theme_name}${info.theme_version ? ` ${info.theme_version}` : ""}`.slice(0, 60));
    } catch {}
    await db.storeTheme.update({ where: { id: theme.id }, data: { engine: "liquid", name, version: { increment: 1 } } });
    await logActivity(`Thème Shopify « ${name} » importé (${paths.length} fichiers)`, `/admin/theme/${theme.id}`);
    revalidatePath("/admin/theme");
    // Thème exporté depuis une boutique Shopify : ses réglages pointent vers des images du marchand (shopify://shop_images/…)
    // hébergées sur le CDN de Shopify, dont l'adresse de base est lisible dans les fichiers du thème. Elles sont récupérées ensuite, par lots.
    const texts = await db.themeFile.findMany({ where: { themeId: theme.id, text: { not: null } }, select: { path: true, text: true } });
    const names = [...new Set(texts.filter((f) => f.path.endsWith(".json")).flatMap((f) => [...(f.text ?? "").matchAll(SHOP_IMAGE)].map((m) => m[1])))].slice(0, 80);
    const base = texts.map((f) => f.text?.match(CDN_BASE)?.[1]).find(Boolean) ?? null;
    return NextResponse.json({ ok: true, url: `/admin/theme?ok=${encodeURIComponent(`« ${name} » ajouté à vos brouillons.`)}`, images: base && names.length ? { base, names } : null });
  }
  if (step === "images") {
    const b = (await req.json().catch(() => null)) as { id?: string; base?: string; names?: string[] } | null;
    const theme = b?.id ? await ownTheme(store.id, b.id) : null;
    if (!theme || theme.engine !== "liquid" || !b?.base || !/^\d+\/\d{4}\/\d{4}\/\d{4}$/.test(b.base) || !Array.isArray(b.names)) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    const found = new Map<string, string>();
    for (const raw of b.names.slice(0, 6)) {
      const name = String(raw);
      if (!/^[\w.%@-]+$/.test(name)) continue;
      const info = await fetchShopifyImageInfo(`https://cdn.shopify.com/s/files/${b.base}/files/${name}`);
      if (!info) continue;
      found.set(name, info.url);
      try { await registerMediaFile(store.id, { url: info.url, name: decodeURIComponent(name), mime: "image/*", size: info.size, width: info.width, height: info.height }); } catch {}
    }
    if (found.size) {
      const files = await db.themeFile.findMany({ where: { themeId: theme.id, path: { endsWith: ".json" } }, select: { path: true, text: true } });
      const changed = files.filter((f) => f.text && [...found.keys()].some((n) => f.text!.includes(`shopify://shop_images/${n}`)));
      await putThemeFiles(theme.id, changed.map((f) => ({ path: f.path, data: new TextEncoder().encode([...found].reduce((t, [n, url]) => t.split(`shopify://shop_images/${n}`).join(url), f.text!)) })));
      await db.storeTheme.update({ where: { id: theme.id }, data: { version: { increment: 1 } } });
    }
    return NextResponse.json({ ok: true, done: found.size });
  }
  return NextResponse.json({ error: "Étape inconnue." }, { status: 400 });
}

/** Abandon d'un import en cours (fermeture de la fenêtre). */
export async function DELETE(req: Request) {
  const { store } = await requirePerm("content");
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const theme = await ownTheme(store.id, id);
  if (theme && theme.engine === "importing") await db.storeTheme.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
