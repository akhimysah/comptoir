import { execSync } from "child_process";

/** Base de test dédiée (prisma/test.db), recréée vide à chaque lancement : la base de développement n'est jamais touchée. */
export default function setup() {
  // TEST_DATABASE_URL permet de lancer les tests sur PostgreSQL (vérifications GitHub).
  const url = process.env.TEST_DATABASE_URL || "file:./test.db";
  execSync("node scripts/prisma.mjs db push --skip-generate --force-reset", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
}
