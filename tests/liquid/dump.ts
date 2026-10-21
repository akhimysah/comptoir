/** Outil de mise au point : LIQUID_FIXTURES=… npx tsx tests/liquid/dump.ts <sortie> — rend chaque page de chaque thème dans un fichier. */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderPage } from "../../src/lib/liquid/engine";
import type { PageData } from "../../src/lib/liquid/types";
import { findThemeRoot, fsSource } from "./memory-source";
import { samplePageData } from "./sample-data";

const FIXTURES = process.env.LIQUID_FIXTURES!;
const OUT = process.argv[2];
const PAGES: PageData["template"][] = ["index", "product", "collection", "cart", "search", "404"];
(async () => {
  await mkdir(OUT, { recursive: true });
  for (const d of await readdir(FIXTURES)) {
    const root = await findThemeRoot(path.join(FIXTURES, d));
    if (!root) continue;
    const source = await fsSource(root);
    for (const template of PAGES) {
      const t0 = performance.now();
      const res = await renderPage(source, samplePageData({ template }));
      console.log(`${d}/${template}: ${Math.round(performance.now() - t0)} ms`);
      await writeFile(path.join(OUT, `${d}-${template}.html`), res.html);
    }
  }
})();
