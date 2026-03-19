import { describe, expect, it } from "vitest";

import { resolveMatrixHomeserverUrl } from "../../src/config";

describe("resolveMatrixHomeserverUrl", () => {
  it("supports railway shorthand", () => {
    const url = resolveMatrixHomeserverUrl({ VITE_MATRIX_HOMESERVER_URL: "railway:blackout-prod" });
    expect(url).toBe("https://blackout-prod.up.railway.app");
  });

  it("falls back to default url", () => {
    const url = resolveMatrixHomeserverUrl({});
    expect(url).toBe("https://matrix.blackout.local");
  });
});
