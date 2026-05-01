import { describe, expect, it } from "vitest";

import { FEATURE_PANEL_REGION_BY_KIND, FEATURE_UI_ENTRIES, FEATURE_UI_ENTRY_PREFIX_BY_KIND, type UiEntryKind } from "../../../src/settings/feature-entrypoints";

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

  it("maps every planned module id to a stable ui entry kind and naming convention", () => {
    const seenIds = new Set<string>();

    for (const entry of FEATURE_UI_ENTRIES) {
      expect(entry.id).toMatch(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
      expect(seenIds.has(entry.id)).toBe(false);
      seenIds.add(entry.id);

      const [kind, uiEntryId] = entry.uiEntry.split(":") as [UiEntryKind, string];
      expect(uiEntryId.startsWith(FEATURE_UI_ENTRY_PREFIX_BY_KIND[kind])).toBe(true);
      expect(FEATURE_PANEL_REGION_BY_KIND[kind]).toBeTruthy();
    }
  });
});
