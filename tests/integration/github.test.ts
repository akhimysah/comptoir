import { createHash, createHmac, createVerify, generateKeyPairSync } from "crypto";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { connectRepo, decryptToken, isBehind, pullTheme, pushTheme, validWebhookSignature } from "@/lib/github";
import { convertManifest, installationRepos, verifyInstallationOwner } from "@/lib/github-app";
import { defaultTheme } from "@/lib/theme";
import { publishTheme, storeThemes } from "@/lib/themes";
import { POST as webhook } from "@/app/api/github/webhook/route";

/** Thèmes reliés à GitHub, contre un faux GitHub en mémoire (mêmes adresses et réponses que l'API). */
type Repo = { refs: Map<string, string>; commits: Map<string, { tree: string; message: string }>; trees: Map<string, Map<string, string>> };
let repo: Repo;
let server: Server;
let n = 0;
const sha = () => createHash("sha1").update(String(++n)).digest("hex");
const blob = (c: string) => { const b = Buffer.from(c); return createHash("sha1").update(`blob ${b.length}\0`).update(b).digest("hex"); };
// Clé de la fausse application GitHub : le faux GitHub vérifie la signature des JWT avec la clé publique.
const keys = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
const validJwt = (auth: string | undefined) => {
  const [h, p, sig] = (auth ?? "").replace("Bearer ", "").split(".");
  if (!sig) return false;
  return createVerify("RSA-SHA256").update(`${h}.${p}`).verify(keys.publicKey, Buffer.from(sig, "base64url")) && JSON.parse(Buffer.from(p, "base64url").toString()).iss === "777";
};

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
      const url = new URL(req.url!, "http://x");
      if (url.pathname === "/app-manifests/code-ok/conversions") return send(201, { id: 777, slug: "revolution-test", pem: keys.privateKey, client_id: "cid", client_secret: "csecret", webhook_secret: "app-secret", owner: { login: "plateforme" } });
      if (url.pathname === "/login/oauth/access_token") return send(200, JSON.parse(body).code === "oauth-ok" ? { access_token: "user-token" } : { error: "bad_verification_code" });
      if (url.pathname === "/user/installations") return req.headers.authorization === "Bearer user-token" ? send(200, { installations: [{ id: 42 }] }) : send(401, {});
      if (url.pathname === "/app/installations/42/access_tokens") return validJwt(req.headers.authorization) ? send(201, { token: "ghs-inst", expires_at: new Date(Date.now() + 3600_000).toISOString() }) : send(401, { message: "JWT invalide" });
      if (url.pathname === "/app/installations/42") return send(200, { account: { login: "akhimysah" } });
      if (url.pathname === "/installation/repositories") return req.headers.authorization === "Bearer ghs-inst" ? send(200, { repositories: [{ full_name: "atelier/theme", default_branch: "main", private: true }] }) : send(401, {});
      if (!["Bearer jeton-test", "Bearer ghs-inst"].includes(req.headers.authorization ?? "")) return send(401, { message: "Bad credentials" });
      const p = url.pathname.replace(/^\/repos\/atelier\/theme/, "");
      const b = body ? JSON.parse(body) : {};
      let m: RegExpMatchArray | null;
      if (p === "" && req.method === "GET") return send(200, { full_name: "atelier/theme", default_branch: "main", permissions: { push: true } });
      if (p === "/branches") return send(200, [...repo.refs.keys()].map((name) => ({ name })));
      if ((m = p.match(/^\/git\/ref\/heads\/(.+)$/))) return repo.refs.has(m[1]) ? send(200, { object: { sha: repo.refs.get(m[1]) } }) : send(404, { message: "Not Found" });
      if (p === "/git/refs" && req.method === "POST") { repo.refs.set(b.ref.replace("refs/heads/", ""), b.sha); return send(201, {}); }
      if ((m = p.match(/^\/git\/commits\/(\w+)$/))) return send(200, { tree: { sha: repo.commits.get(m[1])!.tree } });
      if ((m = p.match(/^\/git\/trees\/(\w+)$/))) return send(200, { tree: [...repo.trees.get(m[1])!].map(([path, c]) => ({ path, sha: blob(c) })) });
      if (p === "/git/trees" && req.method === "POST") { const t = new Map(repo.trees.get(b.base_tree)); for (const e of b.tree) t.set(e.path, e.content); const id = sha(); repo.trees.set(id, t); return send(201, { sha: id }); }
      if (p === "/git/commits" && req.method === "POST") { const id = sha(); repo.commits.set(id, { tree: b.tree, message: b.message }); return send(201, { sha: id }); }
      if ((m = p.match(/^\/git\/refs\/heads\/(.+)$/)) && req.method === "PATCH") { repo.refs.set(m[1], b.sha); return send(200, {}); }
      if ((m = p.match(/^\/contents\/(.+)$/)) && req.method === "GET") {
        const content = repo.trees.get(repo.commits.get(url.searchParams.get("ref")!)!.tree)!.get(decodeURIComponent(m[1]));
        return content === undefined ? send(404, { message: "Not Found" }) : send(200, { content: Buffer.from(content).toString("base64"), encoding: "base64" });
      }
      send(404, { message: `Non simulé : ${req.method} ${p}` });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.GITHUB_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.GITHUB_WEB_URL = process.env.GITHUB_API_URL;
});
afterAll(() => { server.close(); delete process.env.GITHUB_API_URL; delete process.env.GITHUB_WEB_URL; });

let store: Awaited<ReturnType<typeof db.store.create>>;
beforeEach(async () => {
  repo = { refs: new Map(), commits: new Map(), trees: new Map() };
  commitFiles("main", { "README.md": "# Thème\n" }, "Premier commit");
  await db.user.deleteMany();
  await db.platformSetting.deleteMany();
  const owner = await db.user.create({ data: { email: `gh-${Date.now()}@test.local`, name: "Marchand", passwordHash: "x" } });
  store = await db.store.create({ data: { ownerId: owner.id, name: "Atelier", slug: `gh-${Date.now()}`, theme: JSON.stringify(defaultTheme("Atelier")), customCss: "h1 { color: red; }" } });
});

const files = (branch = "main") => repo.trees.get(repo.commits.get(repo.refs.get(branch)!)!.tree)!;
const fresh = () => db.store.findUniqueOrThrow({ where: { id: store.id } });
const row = (id: string) => db.storeTheme.findUniqueOrThrow({ where: { id } });

describe("thème relié à GitHub (jeton collé)", () => {
  it("crée un brouillon relié, envoie le thème sur une branche vide en un seul commit, et garde le jeton chiffré", async () => {
    const draft = await connectRepo(store, { repo: "atelier/theme", branch: "boutique", path: "", token: "jeton-test" });
    expect(draft.name).toBe("theme/boutique");
    expect(JSON.parse(files("boutique").get("theme.json")!).sections.length).toBeGreaterThan(0);
    expect(files("boutique").get("custom.css")).toBe("h1 { color: red; }\n");
    expect(files("boutique").get("README.md")).toBe("# Thème\n"); // le reste du dépôt est conservé
    expect(draft.githubToken).not.toContain("jeton-test");
    expect(decryptToken(draft.githubToken!)).toBe("jeton-test");
    expect(draft.githubLastSha).toBe(repo.refs.get("boutique"));
    expect((await pushTheme(draft, store, "rien")).changed).toBe(false); // rien de nouveau : pas de commit vide
    expect(await isBehind(draft, store)).toBe(false);
  });

  it("lit le thème d'une branche qui en contient déjà un ; publié, il suit chaque push", async () => {
    const theirs = { ...defaultTheme("Atelier"), announcement: "Soldes d'hiver" };
    commitFiles("main", { "theme.json": JSON.stringify(theirs), "custom.css": "body { margin: 0 }" }, "Thème du développeur");
    const draft = await connectRepo(store, { repo: "atelier/theme", branch: "main", path: "", token: "jeton-test" });
    expect(JSON.parse(draft.theme).announcement).toBe("Soldes d'hiver");
    expect(JSON.parse((await fresh()).theme).announcement).toBe(""); // brouillon : la boutique n'a pas changé
    await publishTheme(await fresh(), draft.id);
    expect(JSON.parse((await fresh()).theme).announcement).toBe("Soldes d'hiver");

    commitFiles("main", { "theme.json": JSON.stringify({ ...theirs, announcement: "Livraison offerte" }), "locales/en.json": JSON.stringify({ announcement: "Free shipping" }) }, "Nouveau bandeau");
    expect(await isBehind(await row(draft.id), store)).toBe(true);
    await pullTheme(await row(draft.id), await fresh());
    const s = await fresh();
    expect(JSON.parse(s.theme).announcement).toBe("Livraison offerte");
    expect(JSON.parse(s.translations).en.announcement).toBe("Free shipping");
  });

  it("refuse un thème invalide venu du dépôt, et nettoie le CSS", async () => {
    const draft = await connectRepo(store, { repo: "atelier/theme", branch: "main", path: "", token: "jeton-test" });
    const before = (await row(draft.id)).theme;
    commitFiles("main", { "theme.json": JSON.stringify({ colors: "rouge" }) }, "Cassé");
    await expect(pullTheme(await row(draft.id), await fresh())).rejects.toThrow(/theme.json/);
    expect((await row(draft.id)).theme).toBe(before);
    commitFiles("main", { "theme.json": before, "custom.css": "h1{color:red}</style><script>alert(1)</script>" }, "Injection");
    await pullTheme(await row(draft.id), await fresh());
    expect((await row(draft.id)).customCss).not.toContain("<");
  });

  it("vérifie la signature des webhooks GitHub", () => {
    const body = JSON.stringify({ ref: "refs/heads/main" });
    const sig = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(validWebhookSignature("secret", body, sig)).toBe(true);
    expect(validWebhookSignature("autre", body, sig)).toBe(false);
    expect(validWebhookSignature("secret", body, null)).toBe(false);
  });
});

describe("connexion en un clic (application GitHub de la plateforme)", () => {
  const signed = (body: string, event: string) => new Request("http://localhost/api/github/webhook", { method: "POST", body, headers: { "x-github-event": event, "x-hub-signature-256": `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}` } });

  it("crée l'application par manifeste, vérifie l'installation, relie un dépôt sans jeton et suit les push", async () => {
    const app = await convertManifest("code-ok");
    expect(app.slug).toBe("revolution-test");
    expect((await db.platformSetting.findUniqueOrThrow({ where: { key: "github_app" } })).value).not.toContain("PRIVATE KEY"); // chiffré

    expect(await verifyInstallationOwner("oauth-ok", 42)).toBe(true);
    expect(await verifyInstallationOwner("oauth-ok", 99)).toBe(false); // installation d'un autre compte
    expect((await installationRepos(42)).map((r) => r.name)).toEqual(["atelier/theme"]);

    await db.store.update({ where: { id: store.id }, data: { githubInstallationId: 42 } });
    const draft = await connectRepo(await fresh(), { repo: "atelier/theme", branch: "main", path: "" });
    expect(draft.githubToken).toBeNull();
    expect(files("main").has("theme.json")).toBe(true);
    const { themes, publishedId } = await storeThemes(await fresh());
    expect(themes.map((t) => t.id)).toContain(draft.id);
    expect(publishedId).not.toBe(draft.id);

    // Push sur la branche, signé par l'application : le brouillon suit.
    const next = { ...JSON.parse(files("main").get("theme.json")!), announcement: "Depuis GitHub" };
    const after = commitFiles("main", { "theme.json": JSON.stringify(next) }, "Bandeau");
    const push = JSON.stringify({ ref: "refs/heads/main", after, repository: { full_name: "atelier/theme" }, installation: { id: 42 } });
    expect(await (await webhook(signed(push, "push"))).json()).toEqual({ updated: 1 });
    expect(JSON.parse((await row(draft.id)).theme).announcement).toBe("Depuis GitHub");
    // Mauvaise signature : ignoré.
    const forged = new Request("http://localhost/api/github/webhook", { method: "POST", body: push, headers: { "x-github-event": "push", "x-hub-signature-256": "sha256=00" } });
    expect(await (await webhook(forged)).json()).toEqual({ updated: 0 });

    // Application désinstallée sur GitHub : le compte est déconnecté.
    await webhook(signed(JSON.stringify({ action: "deleted", installation: { id: 42 } }), "installation"));
    expect((await fresh()).githubInstallationId).toBeNull();
  });
});
