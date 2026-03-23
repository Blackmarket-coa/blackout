import { describe, expect, it } from "vitest";

import { renderGovernanceRoomPanel } from "../../src/components/GovernanceRoomPanel";

describe("renderGovernanceRoomPanel", () => {
  it("renders governance tabs and proposal modal", () => {
    const html = renderGovernanceRoomPanel({
      channelLabel: "governance-council",
      activeTab: "proposals",
      showProposalModal: true,
    });

    expect(html).toContain('data-action="governance-set-tab" data-tab="feed"');
    expect(html).toContain('data-action="governance-set-tab" data-tab="proposals"');
    expect(html).toContain('data-action="governance-set-tab" data-tab="taskboard"');
    expect(html).toContain("Create Proposal");
    expect(html).toContain('data-action="governance-close-proposal"');
  });
});
