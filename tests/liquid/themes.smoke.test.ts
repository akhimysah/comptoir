/**
 * Test de fumée sur de vrais thèmes Shopify (non versionnés) : LIQUID_FIXTURES=/chemin/vers/dossier-de-thèmes.
 * Chaque sous-dossier est un thème ; on rend les pages principales et on compte les « Liquid error ».
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderPage } from "@/lib/liquid/engine";
import type { PageData } from "@/lib/liquid/types";
import { findThemeRoot, fsSource } from "./memory-source";
import { samplePageData } from "./sample-data";

const FIXTURES = process.env.LIQUID_FIXTURES;
const PAGES: PageData["template"][] = ["index", "product", "collection", "cart", "search", "404"];

describe.skipIf(!FIXTURES)("thèmes réels (LIQUID_FIXTURES)", async () => {
  const dirs = FIXTURES ? (await readdir(FIXTURES, { withFileTypes: true })).filter((d) => d.isDirectory() && !d.name.startsWith(".")).map((d) => path.join(FIXTURES, d.name)) : [];
  for (const dir of dirs) {
    it(`rend ${path.basename(dir)}`, async () => {
      const root = await findThemeRoot(dir);
      expect(root).toBeTruthy();
      const source = await fsSource(root!);
      const report: string[] = [];
      for (const template of PAGES) {
        const res = await renderPage(source, samplePageData({ template }));
        expect(res.html).toContain("<html");
        expect(res.html).toContain("</html>");
        const errors = res.html.match(/Liquid (syntax )?error[^<\n]{0,160}/g) ?? [];
        const sections = res.html.match(/<!-- section [^ ]+ error:[^>]*-->/g) ?? [];
        report.push(`${template}: ${errors.length} erreur(s) Liquid, ${sections.length} section(s) en échec, ${Math.round(res.html.length / 1024)} Ko` + (errors.length || sections.length ? `\n    ${[...new Set([...errors, ...sections])].slice(0, 12).join("\n    ")}` : ""));
      }
      console.log(`\n[${path.basename(dir)}]\n  ${report.join("\n  ")}`);
    }, 120_000);
  }
});
