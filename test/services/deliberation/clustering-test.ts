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
});
