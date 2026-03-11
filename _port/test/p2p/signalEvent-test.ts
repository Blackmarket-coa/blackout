/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { MsgType } from "matrix-js-sdk/src/matrix";

import {
    createBlackoutSignalEventContent,
    getBlackoutSignalTelemetrySnapshot,
    isBlackoutSignalEventContent,
    maybeSendBlackoutSignalEventForAttachment,
    maybeSendBlackoutSignalEventForMessage,
    sha256,
} from "../../src/p2p";

describe("signalEvent schema and telemetry", () => {
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
        expect(content.schema_version).toBe(1);
        expect(content.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
        expect(content.message_id).toMatch(/^[0-9a-f-]{36}$/i);
        expect(content.room_id).toEqual("!room:example.org");
        expect(content.content_type).toEqual(MsgType.Text);
    });

    it("rejects malformed schema content", () => {
        expect(
            isBlackoutSignalEventContent({
                message_id: "not-a-uuid",
                hash: "sha256:abc",
                size: -1,
                content_type: "m.text",
                room_id: "!room:example.org",
                schema_version: 99,
            }),
        ).toBe(false);
    });

    it("records telemetry skip counters for disabled/non-attachment paths", async () => {
        const sendEvent = jest.fn();
        const client = { sendEvent } as any;
        const before = getBlackoutSignalTelemetrySnapshot();

        await maybeSendBlackoutSignalEventForAttachment(
            client,
            "!room:example.org",
            { body: "hello", msgtype: MsgType.Text },
            null,
            false,
        );

        await maybeSendBlackoutSignalEventForAttachment(
            client,
            "!room:example.org",
            { body: "hello", msgtype: MsgType.Text },
            null,
            true,
        );

        const after = getBlackoutSignalTelemetrySnapshot();
        expect(sendEvent).not.toHaveBeenCalled();
        expect(after.skipped_feature_disabled).toBe(before.skipped_feature_disabled + 1);
        expect(after.skipped_non_attachment).toBe(before.skipped_non_attachment + 1);
    });

    it("dual-writes metadata for text when phase-1 all-events helper is used", async () => {
        const sendEvent = jest.fn().mockResolvedValue({ event_id: "$signal" });

        await maybeSendBlackoutSignalEventForMessage(
            { sendEvent } as any,
            "!room:example.org",
            { body: "text", msgtype: MsgType.Text },
            null,
            true,
        );

        expect(sendEvent).toHaveBeenCalledTimes(1);
    });

    it("produces stable digest for the same input", async () => {
        const digestA = await sha256("test-value");
        const digestB = await sha256("test-value");

        expect(digestA).toEqual(digestB);
    });
});
