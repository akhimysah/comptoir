import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // « server-only » interdit l'import côté navigateur ; dans les tests (Node) il n'a pas d'effet.
      "server-only": path.resolve(__dirname, "tests/server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/global-setup.ts"],
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL || "file:./test.db", NODE_ENV: "test" },
    // Les tests sur la base partagent un fichier SQLite : on les exécute l'un après l'autre.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
