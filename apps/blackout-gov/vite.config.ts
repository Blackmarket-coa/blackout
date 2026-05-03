import { defineConfig } from "vite";
import { sri } from "../blackout-client/vite-plugin-sri";

export default defineConfig({
  build: {
    outDir: "dist/web",
    sourcemap: true,
  },
  plugins: [sri()],
});
