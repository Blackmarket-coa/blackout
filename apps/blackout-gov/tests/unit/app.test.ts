import { describe, expect, it } from "vitest";

import { renderGovernanceShell } from "../../src/app";

const baseConfig = {
  homeserverUrl: "https://matrix.blackout.example",
  mode: "governance",
} as const;

describe("renderGovernanceShell — default view", () => {
  it("renders P1 governance surfaces", () => {
    const html = renderGovernanceShell(baseConfig);

    expect(html).toContain("Proposal creation UI");
    expect(html).toContain('data-action="vote-approve"');
    expect(html).toContain('data-action="meeting-schedule"');
  });

  it("renders P2 delegation/treasury/analytics stats", () => {
    const html = renderGovernanceShell(baseConfig);

    expect(html).toContain("Treasury balance");
    expect(html).toContain("Delegations tracked");
    expect(html).toContain("Participation (30d)");
  });

  it("falls back to default values when no GovernanceData supplied", () => {
    const html = renderGovernanceShell(baseConfig);

    expect(html).toContain('data-testid="treasury-balance"');
    expect(html).toContain("142,300 BMC");
    expect(html).toContain('data-testid="delegations-total"');
    expect(html).toContain(">58<");
    expect(html).toContain('data-testid="analytics-active-proposals"');
    expect(html).toContain(">7<");
    expect(html).toContain('data-testid="analytics-participation"');
    expect(html).toContain("81%");
  });

  it("renders supplied analytics + treasury + delegation values when GovernanceData is provided", () => {
    const html = renderGovernanceShell(baseConfig, {
      data: {
        treasury: { balance: "12.45 ETH", pendingDisbursements: 4 },
        delegations: { total: 209 },
        analytics: { activeProposals: 12, participationLast30d: "63%", quorumRate: "0.74" },
      },
    });

    expect(html).toContain("12.45 ETH");
    expect(html).toContain(">209<");
    expect(html).toContain(">12<");
    expect(html).toContain("63%");
    expect(html).toContain('data-testid="analytics-quorum-rate"');
    expect(html).toContain("0.74");
    expect(html).toContain('data-testid="treasury-pending-disbursements"');
    expect(html).toContain(">4<");
  });

  it("renders delegation rows when supplied", () => {
    const html = renderGovernanceShell(baseConfig, {
      data: {
        delegations: {
          total: 2,
          rows: [
            { delegateId: "@delegate:matrix.example", fromLabel: "Member A", weight: 3 },
            { delegateId: "@another:matrix.example", fromLabel: "Member B", weight: 1 },
          ],
        },
      },
    });

    expect(html).toContain('data-testid="delegation-list"');
    expect(html).toContain('data-testid="delegation-row-@delegate:matrix.example"');
    expect(html).toContain("Member A");
    expect(html).toContain("weight 3");
    expect(html).toContain('data-testid="delegation-row-@another:matrix.example"');
  });

  it("renders treasury feed with direction attributes when supplied", () => {
    const html = renderGovernanceShell(baseConfig, {
      data: {
        treasury: {
          balance: "100 BMC",
          recentTxs: [
            { id: "tx-1", label: "Validator reward", amount: "+5 BMC", direction: "in" },
            { id: "tx-2", label: "Operator stipend", amount: "-12 BMC", direction: "out" },
          ],
        },
      },
    });

    expect(html).toContain('data-testid="treasury-feed"');
    expect(html).toContain('data-testid="treasury-tx-tx-1"');
    expect(html).toContain('data-direction="in"');
    expect(html).toContain('data-testid="treasury-tx-tx-2"');
    expect(html).toContain('data-direction="out"');
    expect(html).toContain("Validator reward");
  });

  it("uses supplied activeProposal title for the voting card", () => {
    const html = renderGovernanceShell(baseConfig, {
      data: {
        activeProposal: {
          id: "prop-42",
          title: "Ratify federation peering policy",
          voteType: "supermajority",
          state: "open",
        },
      },
    });

    expect(html).toContain("Ratify federation peering policy");
    expect(html).not.toContain("Adopt rotating incident commander schedule.");
  });

  it("escapes HTML in user-supplied data fields", () => {
    const html = renderGovernanceShell(
      { ...baseConfig, homeserverUrl: "https://m.example/<script>" },
      {
        data: {
          activeProposal: {
            id: "p1",
            title: "<img src=x onerror=alert(1)>",
            voteType: "simple_majority",
            state: "open",
          },
        },
      },
    );

    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("renderGovernanceShell — simplified view", () => {
  it("hides scheduler, runtime config, and P2 ops surface", () => {
    const html = renderGovernanceShell(baseConfig, { view: "simplified" });

    expect(html).toContain('data-view="simplified"');
    expect(html).not.toContain("Meeting scheduler UI");
    expect(html).not.toContain("Runtime configuration");
    expect(html).not.toContain('data-testid="ops-surface"');
    expect(html).not.toContain("Proposal creation UI");
  });

  it("renders condensed voting card with active proposal", () => {
    const html = renderGovernanceShell(baseConfig, {
      view: "simplified",
      data: {
        activeProposal: {
          id: "prop-42",
          title: "Ratify federation peering policy",
          voteType: "supermajority",
          state: "open",
        },
      },
    });

    expect(html).toContain('data-testid="simplified-voting-card"');
    expect(html).toContain("Ratify federation peering policy");
    expect(html).toContain('data-action="vote-approve"');
    expect(html).toContain('data-action="vote-block"');
    expect(html).toContain('data-action="vote-abstain"');
  });

  it("renders recent decisions when provided", () => {
    const html = renderGovernanceShell(baseConfig, {
      view: "simplified",
      data: {
        recentProposals: [
          { id: "p1", title: "Approve Q2 resiliency budget", voteType: "simple_majority", state: "passed" },
          { id: "p2", title: "Adopt incident commander rotation", voteType: "supermajority", state: "rejected" },
        ],
      },
    });

    expect(html).toContain('data-testid="simplified-recent-decisions"');
    expect(html).toContain('data-testid="recent-proposal-p1"');
    expect(html).toContain("gov-shell__status--passed");
    expect(html).toContain('data-testid="recent-proposal-p2"');
    expect(html).toContain("gov-shell__status--rejected");
  });

  it("omits the decisions section when no recentProposals are provided", () => {
    const html = renderGovernanceShell(baseConfig, { view: "simplified" });

    expect(html).not.toContain('data-testid="simplified-recent-decisions"');
  });
});
