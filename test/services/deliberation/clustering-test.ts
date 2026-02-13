/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { clusterOpinions } from "../../../src/services/deliberation/clustering";

describe("clusterOpinions", () => {
    it("clusters similar vectors deterministically", () => {
        const clusters = clusterOpinions([
            { userId: "@alice:example.org", values: [1, 0.9, 0.1] },
            { userId: "@bob:example.org", values: [0.98, 0.88, 0.12] },
            { userId: "@carol:example.org", values: [0.05, 0.1, 1] },
        ]);

        expect(clusters).toHaveLength(2);
        expect(clusters[0].memberIds).toEqual(["@alice:example.org", "@bob:example.org"]);
        expect(clusters[1].memberIds).toEqual(["@carol:example.org"]);
    });

    it("filters out sparse vectors that do not meet minimum length", () => {
        const clusters = clusterOpinions(
            [
                { userId: "@alice:example.org", values: [1, 1] },
                { userId: "@bob:example.org", values: [] },
            ],
            { minimumVectorLength: 2 },
        );

        expect(clusters).toHaveLength(1);
        expect(clusters[0].memberIds).toEqual(["@alice:example.org"]);
    });

    it("filters adversarial vectors (duplicate users, non-finite values, mismatched dimensions)", () => {
        const clusters = clusterOpinions([
            { userId: "@alice:example.org", values: [1, 0.9, 0.1] },
            { userId: "@alice:example.org", values: [0.9, 0.9, 0.2] },
            { userId: "@bob:example.org", values: [0.98, 0.88, 0.12] },
            { userId: "@mallory:example.org", values: [Number.NaN, 0.1, 0.2] },
            { userId: "@eve:example.org", values: [1, 0.1] },
            { userId: "", values: [0.5, 0.5, 0.5] },
        ]);

        expect(clusters).toHaveLength(1);
        expect(clusters[0].memberIds).toEqual(["@alice:example.org", "@bob:example.org"]);
    });

    it("throws for invalid config bounds", () => {
        expect(() =>
            clusterOpinions([{ userId: "@alice:example.org", values: [1, 1] }], { similarityThreshold: 2 }),
        ).toThrow("similarityThreshold must be a finite number between -1 and 1");

        expect(() =>
            clusterOpinions([{ userId: "@alice:example.org", values: [1, 1] }], { minimumVectorLength: 0 }),
        ).toThrow("minimumVectorLength must be a positive integer");
    });
});
