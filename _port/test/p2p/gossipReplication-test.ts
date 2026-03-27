/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { GossipReplicator } from "../../src/p2p";

describe("GossipReplicator", () => {
    it("computes missing hashes and under-replicated hashes", () => {
        const replicator = new GossipReplicator("!room:example.org", 3);
        replicator.onPeerInventory("@alice:example.org", ["a", "b"]);
        replicator.onPeerInventory("@bob:example.org", ["b", "c"]);

        const request = replicator.buildMissingRequest("@alice:example.org", ["a"]);
        expect(request.missingHashes.sort()).toEqual(["b", "c"]);

        const under = replicator.hashesNeedingReplication(
            new Map([
                ["a", 3],
                ["b", 2],
                ["c", 1],
            ]),
        );
        expect(under.sort()).toEqual(["b", "c"]);
    });
});
