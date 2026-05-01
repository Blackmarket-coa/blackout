import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Several integration tests in `tests/integration/app.test.ts` mount
    // the full app three times across preset transitions and need more
    // headroom than vitest's 5s default — they pass locally at 4–8s
    // but flake on the slower CI runners. 30s aligns with the
    // integration-test convention without masking real regressions
    // (any test exceeding 30s is still a failure).
    testTimeout: 30000,
    coverage: {
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
    },
  },
});
