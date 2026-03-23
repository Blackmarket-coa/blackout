import { describe, expect, it } from "vitest";

import { renderTownhallPanel } from "../../src/components/TownhallPanel";

describe("renderTownhallPanel", () => {
  it("renders mode toggles and SFU townhall view", () => {
    const html = renderTownhallPanel({
      channelLabel: "townhall-stage",
      mode: "townhall",
    });

    expect(html).toContain('data-action="townhall-set-mode" data-mode="standard"');
    expect(html).toContain('data-action="townhall-set-mode" data-mode="townhall"');
    expect(html).toContain('data-testid="townhall-sfu-view"');
  });
});
