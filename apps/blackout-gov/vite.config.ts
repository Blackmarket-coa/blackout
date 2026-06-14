import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { sri } from "../blackout-client/vite-plugin-sri";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    outDir: "dist/web",
    sourcemap: true,
  },
  resolve: {
    // Resolve the shared design tokens from source so the build does not
    // depend on `@blackout/design`'s `dist` being built first in CI.
    alias: {
      "@blackout/design": path.resolve(rootDir, "../../packages/design/src/index.ts"),
    },
  },
  plugins: [sri()],
});
