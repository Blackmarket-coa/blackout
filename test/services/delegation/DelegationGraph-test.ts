/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { DelegationGraph } from "../../../src/services/delegation/DelegationGraph";

describe("DelegationGraph", () => {
    it("detects and prevents cycles", () => {
        const graph = new DelegationGraph();

        graph.setDelegation("budget", "@alice:example.org", "@bob:example.org");
        graph.setDelegation("budget", "@bob:example.org", "@carol:example.org");

        expect(() => graph.setDelegation("budget", "@carol:example.org", "@alice:example.org")).toThrow(
            "Delegation would introduce a cycle",
        );
    });

    it("uses direct votes as overrides and explains delegated paths", () => {
        const graph = new DelegationGraph();
        graph.setDelegation("budget", "@alice:example.org", "@bob:example.org");
        graph.setDelegation("budget", "@bob:example.org", "@carol:example.org");

        const direct = new Set(["@alice:example.org"]);
        expect(graph.resolve("budget", "@alice:example.org", direct)).toMatchObject({
            effectiveVoter: "@alice:example.org",
            reason: "direct_vote",
        });

        const delegated = graph.resolve("budget", "@alice:example.org", new Set(["@carol:example.org"]));
        expect(delegated).toMatchObject({
            effectiveVoter: "@carol:example.org",
            reason: "delegation_chain",
            path: ["@alice:example.org", "@bob:example.org", "@carol:example.org"],
        });
    });

    it("uses global delegations when topic-specific delegation is missing", () => {
        const graph = new DelegationGraph();
        graph.setDelegation(DelegationGraph.GlobalTopic, "@alice:example.org", "@bob:example.org");

        const resolution = graph.resolve("budget", "@alice:example.org", new Set(["@bob:example.org"]));
        expect(resolution).toMatchObject({
            effectiveVoter: "@bob:example.org",
            reason: "delegation_chain",
            path: ["@alice:example.org", "@bob:example.org"],
        });
    });

    it("enforces revocation windows", () => {
        const graph = new DelegationGraph({ revocationWindowMs: 100, maxDelegationsPerUserPerHour: 100 });
        graph.setDelegation("budget", "@alice:example.org", "@bob:example.org", 1_000);

        expect(() => graph.clearDelegation("budget", "@alice:example.org", 1_200)).toThrow(
            "Delegation revocation window has elapsed",
        );
    });

    it("keeps an audit trail", () => {
        const graph = new DelegationGraph();
        graph.setDelegation("budget", "@alice:example.org", "@bob:example.org");
        graph.clearDelegation("budget", "@alice:example.org");

        expect(graph.getAuditTrail().map((entry) => entry.action)).toEqual(["set", "clear"]);
    });
});
