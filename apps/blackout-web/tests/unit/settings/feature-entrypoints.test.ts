import { describe, expect, it } from "vitest";

import { FEATURE_UI_ENTRIES } from "../../../src/settings/feature-entrypoints";

describe("FEATURE_UI_ENTRIES", () => {
  it("does not allow duplicate preset keys unless explicitly marked as an alias", () => {
    const firstEntryByPresetKey = new Map<string, string>();

    for (const entry of FEATURE_UI_ENTRIES) {
      const existingId = firstEntryByPresetKey.get(entry.presetKey);

      if (!existingId) {
        firstEntryByPresetKey.set(entry.presetKey, entry.id);
        continue;
      }

      expect(entry.aliasOfId).toBe(existingId);
    }
  });
});
