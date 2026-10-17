import { createHash, createHmac } from "crypto";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { connectRepo, decryptToken, pullTheme, pushTheme, validWebhookSignature } from "@/lib/github";
import { defaultTheme } from "@/lib/theme";

/** Thème relié à GitHub, contre un faux GitHub en mémoire (mêmes adresses et réponses que l'API). */
type Repo = { refs: Map<string, string>; commits: Map<string, { tree: string; message: string }>; trees: Map<string, Map<string, string>> };
let repo: Repo;
let server: Server;
let n = 0;
const sha = () => createHash("sha1").update(String(++n)).digest("hex");
const blob = (c: string) => { const b = Buffer.from(c); return createHash("sha1").update(`blob ${b.length}\0`).update(b).digest("hex"); };

function commitFiles(branch: string, files: Record<string, string>, message: string) {
  const parent = repo.refs.get(branch);
  const base = parent ? new Map(repo.trees.get(repo.commits.get(parent)!.tree)) : new Map<string, string>();
  for (const [p, c] of Object.entries(files)) base.set(p, c);
  const tree = sha(); repo.trees.set(tree, base);
  const c = sha(); repo.commits.set(c, { tree, message });
  repo.refs.set(branch, c);
  return c;
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const send = (status: number, json: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(json)); };
      if (req.headers.authorization !== "Bearer jeton-test") return send(401, { message: "Bad credentials" });
      const url = new URL(req.url!, "http://x");
      const p = url.pathname.replace(/^\/repos\/atelier\/theme/, "");
      const b = body ? JSON.parse(body) : {};
      let m: RegExpMatchArray | null;
      if (p === "" && req.method === "GET") return send(200, { full_name: "atelier/theme", default_branch: "main", permissions: { push: true } });
      if ((m = p.match(/^\/git\/ref\/heads\/(.+)$/))) return repo.refs.has(m[1]) ? send(200, { object: { sha: repo.refs.get(m[1]) } }) : send(404, { message: "Not Found" });
      if (p === "/git/refs" && req.method === "POST") { repo.refs.set(b.ref.replace("refs/heads/", ""), b.sha); return send(201, {}); }
      if ((m = p.match(/^\/git\/commits\/(\w+)$/))) return send(200, { tree: { sha: repo.commits.get(m[1])!.tree } });
      if ((m = p.match(/^\/git\/trees\/(\w+)$/))) return send(200, { tree: [...repo.trees.get(m[1])!].map(([path, c]) => ({ path, sha: blob(c) })) });
      if (p === "/git/trees" && req.method === "POST") { const t = new Map(repo.trees.get(b.base_tree)); for (const e of b.tree) t.set(e.path, e.content); const id = sha(); repo.trees.set(id, t); return send(201, { sha: id }); }
      if (p === "/git/commits" && req.method === "POST") { const id = sha(); repo.commits.set(id, { tree: b.tree, message: b.message }); return send(201, { sha: id }); }
      if ((m = p.match(/^\/git\/refs\/heads\/(.+)$/)) && req.method === "PATCH") { repo.refs.set(m[1], b.sha); return send(200, {}); }
      if ((m = p.match(/^\/contents\/(.+)$/)) && req.method === "GET") {
        const ref = url.searchParams.get("ref")!;
        const content = repo.trees.get(repo.commits.get(ref)!.tree)!.get(decodeURIComponent(m[1]));
        return content === undefined ? send(404, { message: "Not Found" }) : send(200, { content: Buffer.from(content).toString("base64"), encoding: "base64" });
      }
      send(404, { message: `Non simulé : ${req.method} ${p}` });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.GITHUB_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); delete process.env.GITHUB_API_URL; });

let store: Awaited<ReturnType<typeof db.store.create>>;
beforeEach(async () => {
  repo = { refs: new Map(), commits: new Map(), trees: new Map() };
  commitFiles("main", { "README.md": "# Thème\n" }, "Premier commit");
  await db.user.deleteMany();
  const owner = await db.user.create({ data: { email: `gh-${Date.now()}@test.local`, name: "Marchand", passwordHash: "x" } });
  store = await db.store.create({ data: { ownerId: owner.id, name: "Atelier", slug: `gh-${Date.now()}`, theme: JSON.stringify(defaultTheme("Atelier")), customCss: "h1 { color: red; }" } });
});

const files = (branch = "main") => repo.trees.get(repo.commits.get(repo.refs.get(branch)!)!.tree)!;
const fresh = () => db.store.findUniqueOrThrow({ where: { id: store.id } });

describe("thème relié à GitHub", () => {
  it("envoie le thème sur une branche sans thème, en un seul commit, et garde le jeton chiffré", async () => {
    const r = await connectRepo(store, { repo: "atelier/theme", branch: "boutique", path: "", token: "jeton-test" });
    expect(r.imported).toBe(false);
    expect(JSON.parse(files("boutique").get("theme.json")!).sections.length).toBeGreaterThan(0);
    expect(files("boutique").get("custom.css")).toBe("h1 { color: red; }\n");
    expect(files("boutique").get("README.md")).toBe("# Thème\n"); // le reste du dépôt est conservé
    const s = await fresh();
    expect(s.githubToken).not.toContain("jeton-test");
    expect(decryptToken(s.githubToken!)).toBe("jeton-test");
    expect(s.githubLastSha).toBe(repo.refs.get("boutique"));
    expect((await pushTheme(s, "rien")).changed).toBe(false); // rien de nouveau : pas de commit vide
  });

  it("importe le thème d'une branche qui en contient déjà un, puis applique chaque push", async () => {
    const theirs = { ...defaultTheme("Atelier"), announcement: "Soldes d'hiver" };
    commitFiles("main", { "theme.json": JSON.stringify(theirs), "custom.css": "body { margin: 0 }" }, "Thème du développeur");
    const r = await connectRepo(store, { repo: "atelier/theme", branch: "main", path: "", token: "jeton-test" });
    expect(r.imported).toBe(true);
    expect(JSON.parse((await fresh()).theme).announcement).toBe("Soldes d'hiver");

    commitFiles("main", { "theme.json": JSON.stringify({ ...theirs, announcement: "Livraison offerte" }), "locales/en.json": JSON.stringify({ announcement: "Free shipping" }) }, "Nouveau bandeau");
    await pullTheme(await fresh());
    const s = await fresh();
    expect(JSON.parse(s.theme).announcement).toBe("Livraison offerte");
    expect(JSON.parse(s.translations).en.announcement).toBe("Free shipping");
  });

  it("refuse un thème invalide venu du dépôt, et nettoie le CSS", async () => {
    await connectRepo(store, { repo: "atelier/theme", branch: "main", path: "", token: "jeton-test" });
    const before = (await fresh()).theme;
    commitFiles("main", { "theme.json": JSON.stringify({ colors: "rouge" }) }, "Cassé");
    await expect(pullTheme(await fresh())).rejects.toThrow(/theme.json/);
    expect((await fresh()).theme).toBe(before);
    commitFiles("main", { "theme.json": before, "custom.css": "h1{color:red}</style><script>alert(1)</script>" }, "Injection");
    await pullTheme(await fresh());
    expect((await fresh()).customCss).not.toContain("<");
  });

  it("vérifie la signature des webhooks GitHub", () => {
    const body = JSON.stringify({ ref: "refs/heads/main" });
    const sig = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(validWebhookSignature("secret", body, sig)).toBe(true);
    expect(validWebhookSignature("autre", body, sig)).toBe(false);
    expect(validWebhookSignature("secret", body, null)).toBe(false);
  });
});
