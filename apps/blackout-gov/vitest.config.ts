import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    // Resolve the shared design tokens from source so tests do not depend on
    // `@blackout/design`'s `dist` being built first in CI.
    alias: {
      "@blackout/design": path.resolve(rootDir, "../../packages/design/src/index.ts"),
    },
  },
});
