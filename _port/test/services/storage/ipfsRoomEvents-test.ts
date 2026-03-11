/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import {
    fromRoomContent,
    IPFS_ROOM_EVENT_TYPE,
    toRoomEventContent,
    toRoomStateContent,
} from "../../../src/services/storage/ipfsRoomEvents";
import type { IpfsCidReference } from "../../../src/services/storage/ipfsService";

describe("ipfsRoomEvents", () => {
    const reference: IpfsCidReference = {
        roomId: "!room:example.org",
        cid: "bafy-test",
        name: "syllabus.pdf",
        uploadedByUserId: "@alice:example.org",
        uploadedAt: 1730000000000,
    };

    it("builds Matrix event payload content for IPFS assets", () => {
        expect(toRoomEventContent(reference)).toEqual({
            msgtype: IPFS_ROOM_EVENT_TYPE,
            body: "syllabus.pdf",
            ipfs: {
                cid: "bafy-test",
                room_id: "!room:example.org",
                name: "syllabus.pdf",
                uploaded_by: "@alice:example.org",
                uploaded_at: 1730000000000,
            },
        });
    });

    it("builds aggregate room-state payloads", () => {
        const content = toRoomStateContent([reference]);
        expect(content.schema_version).toBe(1);
        expect(content.assets).toHaveLength(1);
        expect(content.assets[0].cid).toBe("bafy-test");
    });

    it("parses event/state payload content with room safety checks", () => {
        const content = toRoomEventContent(reference);
        expect(fromRoomContent(content, "!room:example.org")).toEqual(reference);
        expect(fromRoomContent(content, "!different:example.org")).toBeUndefined();
        expect(fromRoomContent({ ipfs: { cid: 1 } })).toBeUndefined();
    });
});
