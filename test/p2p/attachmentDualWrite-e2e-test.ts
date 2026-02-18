/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { MsgType } from "matrix-js-sdk/src/matrix";

import { maybeSendBlackoutSignalEventForAttachment } from "../../src/p2p";

describe("attachment dual-write feature flag integration", () => {
    it("does not regress base message send path when flag is off", async () => {
        const baseSendMessage = jest.fn().mockResolvedValue({ event_id: "$event" });
        const sendEvent = jest.fn();

        // Simulate successful Matrix attachment send regardless of blackout flag state.
        await baseSendMessage("!room:example.org", null, { body: "file", msgtype: MsgType.File });
        await maybeSendBlackoutSignalEventForAttachment(
            { sendEvent } as any,
            "!room:example.org",
            { body: "file", msgtype: MsgType.File },
            null,
            false,
        );

        expect(baseSendMessage).toHaveBeenCalledTimes(1);
        expect(sendEvent).not.toHaveBeenCalled();
    });

    it("dual-writes metadata event when flag is on for attachments", async () => {
        const sendEvent = jest.fn().mockResolvedValue({ event_id: "$signal" });

        await maybeSendBlackoutSignalEventForAttachment(
            { sendEvent } as any,
            "!room:example.org",
            { body: "file", msgtype: MsgType.File },
            null,
            true,
        );

        expect(sendEvent).toHaveBeenCalledTimes(1);
        const [roomId, eventType, content] = sendEvent.mock.calls[0];
        expect(roomId).toEqual("!room:example.org");
        expect(eventType).toEqual("m.blackout.signal");
        expect(content.content_type).toEqual(MsgType.File);
    });
});
