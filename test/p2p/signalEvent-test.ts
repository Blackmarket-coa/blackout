/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { MsgType } from "matrix-js-sdk/src/matrix";

import { createBlackoutSignalEventContent, isBlackoutSignalEventContent, sha256 } from "../../src/p2p";

describe("signalEvent", () => {
    it("creates valid m.blackout.signal content", async () => {
        const content = await createBlackoutSignalEventContent(
            "!room:example.org",
            {
                body: "hello",
                msgtype: MsgType.Text,
            },
            null,
        );

        expect(isBlackoutSignalEventContent(content)).toBe(true);
        expect(content.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
        expect(content.message_id).toHaveLength(36);
        expect(content.room_id).toEqual("!room:example.org");
        expect(content.content_type).toEqual(MsgType.Text);
    });

    it("produces stable digest for the same input", async () => {
        const digestA = await sha256("test-value");
        const digestB = await sha256("test-value");

        expect(digestA).toEqual(digestB);
    });
});
