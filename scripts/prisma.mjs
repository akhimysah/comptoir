#!/usr/bin/env node
/**
 * Lance Prisma avec la bonne base : SQLite en développement, PostgreSQL dès que DATABASE_URL est une adresse postgres://.
 * Un seul schéma à maintenir (prisma/schema.prisma) ; la variante PostgreSQL est générée dans prisma/postgres/.
 *   node scripts/prisma.mjs generate
 *   node scripts/prisma.mjs db push
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.DATABASE_URL ?? "";
let schema = join(root, "prisma/schema.prisma");

if (/^postgres(ql)?:/.test(url)) {
  const source = readFileSync(schema, "utf8");
  const pg = source.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
  if (pg === source) throw new Error("Le schéma ne contient pas provider = \"sqlite\" : rien à convertir.");
  mkdirSync(join(root, "prisma/postgres"), { recursive: true });
  schema = join(root, "prisma/postgres/schema.prisma");
  writeFileSync(schema, `// Fichier généré par scripts/prisma.mjs depuis prisma/schema.prisma — ne pas modifier.\n${pg}`);
}

// Mise à jour du schéma : connexion directe (Neon, Vercel Postgres) plutôt que le pool de connexions.
const direct = process.argv[2] === "db" ? process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING : "";
const env = direct ? { ...process.env, DATABASE_URL: direct } : process.env;
const result = spawnSync("npx", ["prisma", ...process.argv.slice(2), "--schema", schema], { stdio: "inherit", cwd: root, env });
process.exit(result.status ?? 1);
