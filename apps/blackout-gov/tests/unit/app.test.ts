import { describe, expect, it } from "vitest";

import { renderGovernanceShell } from "../../src/app";

describe("renderGovernanceShell", () => {
  it("renders P1 governance surfaces", () => {
    const html = renderGovernanceShell({
      homeserverUrl: "https://matrix.blackout.example",
      mode: "governance",
    });

    expect(html).toContain("Proposal creation UI");
    expect(html).toContain('data-action="vote-approve"');
    expect(html).toContain('data-action="meeting-schedule"');
  });

  it("renders P2 delegation/treasury/analytics stats", () => {
    const html = renderGovernanceShell({
      homeserverUrl: "https://matrix.blackout.example",
      mode: "governance",
    });

    expect(html).toContain("Treasury balance");
    expect(html).toContain("Delegations tracked");
    expect(html).toContain("Participation (30d)");
  });
});
