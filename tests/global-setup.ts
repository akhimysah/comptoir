import { execSync } from "child_process";

/** Base de test dédiée (prisma/test.db), recréée vide à chaque lancement : la base de développement n'est jamais touchée. */
export default function setup() {
  execSync("npx prisma db push --skip-generate --force-reset", { env: { ...process.env, DATABASE_URL: "file:./test.db" }, stdio: "ignore" });
}
