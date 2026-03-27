/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { selectDeterministicJury } from "../../../src/services/governance/sortition";

describe("selectDeterministicJury", () => {
    const seed = {
        roomId: "!room:example.org",
        proposalId: "proposal-123",
        eventId: "$event-1",
        timestampMs: 1735689600000,
    };

    it("returns deterministic jury results and proof for the same input", () => {
        const participants = [
            { userId: "@alice:example.org", powerLevel: 100, isActive: true },
            { userId: "@bob:example.org", powerLevel: 60, isActive: true },
            { userId: "@carol:example.org", powerLevel: 50, isActive: true },
            { userId: "@dave:example.org", powerLevel: 40, isActive: true },
        ];

        const policy = { jurySize: 2, minPowerLevel: 50, requireActive: true };
        const first = selectDeterministicJury(participants, seed, policy);
        const second = selectDeterministicJury(participants, seed, policy);

        expect(first).toEqual(second);
        expect(first.selectedJurorIds).toHaveLength(2);
        expect(first.proof.algorithm).toBe("sha256-xof-draw");
        expect(first.proof.seedMaterial).toContain(seed.roomId);
        expect(first.proof.seedHash).toHaveLength(64);
    });

    it("enforces filters and handles over-sized jury requests", () => {
        const result = selectDeterministicJury(
            [
                { userId: "@alice:example.org", powerLevel: 60, isActive: true },
                { userId: "@bob:example.org", powerLevel: 49, isActive: true },
                { userId: "@carol:example.org", powerLevel: 70, isActive: false },
                { userId: "@dave:example.org", powerLevel: 55, isActive: true },
            ],
            seed,
            {
                jurySize: 10,
                minPowerLevel: 50,
                requireActive: true,
                excludedUserIds: ["@dave:example.org"],
            },
        );

        expect(result.eligibleCount).toBe(1);
        expect(result.policy.jurySize).toBe(1);
        expect(result.selectedJurorIds).toEqual(["@alice:example.org"]);
    });

    it("throws for empty eligibility", () => {
        expect(() =>
            selectDeterministicJury([{ userId: "@alice:example.org", powerLevel: 10, isActive: false }], seed, {
                jurySize: 1,
                minPowerLevel: 50,
                requireActive: true,
            }),
        ).toThrow("No eligible participants for sortition");
    });

    it("throws when jurySize is not a positive integer", () => {
        expect(() =>
            selectDeterministicJury([{ userId: "@alice:example.org", powerLevel: 100 }], seed, {
                jurySize: 0,
            }),
        ).toThrow("Sortition jurySize must be a positive integer");

        expect(() =>
            selectDeterministicJury([{ userId: "@alice:example.org", powerLevel: 100 }], seed, {
                jurySize: 1.5,
            }),
        ).toThrow("Sortition jurySize must be a positive integer");
    });

    it("throws for duplicate participants to prevent ambiguous eligibility", () => {
        expect(() =>
            selectDeterministicJury(
                [
                    { userId: "@alice:example.org", powerLevel: 10, isActive: false },
                    { userId: "@alice:example.org", powerLevel: 80, isActive: true },
                    { userId: "@bob:example.org", powerLevel: 70, isActive: true },
                ],
                seed,
                {
                    jurySize: 2,
                    minPowerLevel: 50,
                    requireActive: true,
                },
            ),
        ).toThrow("Duplicate participant for sortition: @alice:example.org");
    });

    it("throws for participants with missing userId", () => {
        expect(() =>
            selectDeterministicJury([{ userId: "", powerLevel: 100 }], seed, {
                jurySize: 1,
            }),
        ).toThrow("Sortition participants must have a non-empty userId");
    });
});
