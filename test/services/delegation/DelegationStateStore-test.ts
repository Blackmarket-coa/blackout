/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { DelegationStateStore } from "../../../src/services/delegation/DelegationStateStore";

describe("DelegationStateStore", () => {
    it("persists delegation docs to CRDT and emits state events", async () => {
        const store = new DelegationStateStore();
        const roomId = "!room:example.org";
        const topic = "budget";

        await store.persist(roomId, topic, { "@alice:example.org": "@bob:example.org" });

        await expect(store.load(roomId, topic)).resolves.toEqual({ "@alice:example.org": "@bob:example.org" });
        expect(store.getSnapshot(roomId, topic)).toBeInstanceOf(Uint8Array);
        expect(store.listEvents(roomId)).toHaveLength(1);
    });
});
