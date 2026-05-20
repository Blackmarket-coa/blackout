import { describe, expect, it } from "vitest";

import { resolveMatrixHomeserverUrl } from "../../src/config";

describe("resolveMatrixHomeserverUrl", () => {
  it("falls back to BLACKOUT_SERVER_URL when VITE var is missing", () => {
    const url = resolveMatrixHomeserverUrl({
      BLACKOUT_SERVER_URL: "matrix.blackout.example",
    });

    expect(url).toBe("https://matrix.blackout.example");
  });

  it("defaults when both env vars are unset", () => {
    const url = resolveMatrixHomeserverUrl({});

    expect(url).toBe("https://matrix.theblackout.app");
  });
});
