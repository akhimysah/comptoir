#!/usr/bin/env node
/**
 * Dépose un thème Shopify (.zip) dans la bibliothèque de thèmes de la plateforme, par lots, comme le fait l'admin.
 *   node scripts/seed-platform-theme.mjs <theme.zip> --url https://ma-plateforme.fr --token $PLATFORM_IMPORT_TOKEN [--thumb capture.png] [--description "…"]
 * Le jeton est la variable PLATFORM_IMPORT_TOKEN du serveur (réservée à ce script, jamais affichée dans l'admin).
 */
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const zipPath = args.find((a) => a.endsWith(".zip"));
const base = (opt("--url") ?? "http://localhost:3000").replace(/\/$/, "");
const token = opt("--token") ?? process.env.PLATFORM_IMPORT_TOKEN;
if (!zipPath || !token) { console.error("Usage : node scripts/seed-platform-theme.mjs <theme.zip> --url <adresse> --token <jeton> [--thumb capture.png] [--description \"…\"]"); process.exit(1); }

const headers = { Authorization: `Bearer ${token}` };
const call = async (step, init) => {
  const res = await fetch(`${base}/admin/theme/import?step=${step}&platform=1`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status} (${step})`);
  return json;
};

const entries = unzipSync(new Uint8Array(readFileSync(zipPath)), { filter: (f) => !f.name.includes("__MACOSX") && !f.name.endsWith("/") && f.originalSize <= 8 * 1024 * 1024 });
const files = Object.keys(entries).filter((p) => /(^|\/)(layout|templates|sections|snippets|config|locales|assets|blocks)\//.test(p));
const bytes = files.reduce((n, p) => n + entries[p].length, 0);
console.log(`${zipPath} : ${files.length} fichiers, ${(bytes / 1048576).toFixed(1)} Mo → ${base}`);
const { id } = await call("start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: zipPath.split("/").pop(), files: files.length, bytes }) });
try {
  let batch = [], size = 0, done = 0;
  const flush = async () => {
    if (!batch.length) return;
    const fd = new FormData();
    fd.set("id", id);
    for (const p of batch) { fd.append("path", p); fd.append("file", new Blob([entries[p]]), p.split("/").pop()); }
    await call("files", { method: "POST", body: fd });
    done += batch.length; process.stdout.write(`\r  ${done}/${files.length} fichiers envoyés`);
    batch = []; size = 0;
  };
  for (const p of files) { if (size + entries[p].length > 3_000_000 || batch.length >= 150) await flush(); batch.push(p); size += entries[p].length; }
  await flush();
  console.log();
  const fin = await call("finish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  const thumb = opt("--thumb");
  if (thumb) {
    const fd = new FormData();
    fd.set("id", id); fd.set("file", new Blob([readFileSync(thumb)], { type: "image/png" }), "thumbnail.png");
    if (opt("--description")) fd.set("description", opt("--description"));
    await call("thumbnail", { method: "POST", body: fd });
  }
  console.log(`OK : ${decodeURIComponent(fin.url.split("ok=")[1] ?? "")}`);
} catch (e) {
  await fetch(`${base}/admin/theme/import?id=${id}&platform=1`, { method: "DELETE", headers }).catch(() => {});
  console.error("Échec :", e.message); process.exit(1);
}
