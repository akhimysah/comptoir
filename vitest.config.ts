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
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
