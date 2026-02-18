/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import { type RoomMessageEventContent } from "matrix-js-sdk/src/types";
import { logger } from "matrix-js-sdk/src/logger";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";

export const BLACKOUT_SIGNAL_EVENT_TYPE = "m.blackout.signal";

export interface BlackoutSignalEventContent {
    content_type: string;
    hash: string;
    message_id: string;
    room_id: string;
    routing_metadata?: {
        relation_type?: string;
        thread_id?: string | null;
    };
    size: number;
}

export function isBlackoutSignalEventContent(content: unknown): content is BlackoutSignalEventContent {
    if (!content || typeof content !== "object") return false;

    const candidate = content as Partial<BlackoutSignalEventContent>;

    return (
        typeof candidate.message_id === "string" &&
        typeof candidate.hash === "string" &&
        typeof candidate.size === "number" &&
        typeof candidate.content_type === "string" &&
        typeof candidate.room_id === "string"
    );
}

function bytesToHex(bytes: Uint8Array): string {
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256(value: string): Promise<string> {
    const encoded = new TextEncoder().encode(value);

    if (globalThis.crypto?.subtle) {
        const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
        return bytesToHex(new Uint8Array(digest));
    }

    return createHash("sha256").update(encoded).digest("hex");
}

function getRelationType(messageContent: RoomMessageEventContent): string | undefined {
    const relatesTo = messageContent["m.relates_to"];
    if (!relatesTo || typeof relatesTo !== "object") return undefined;
    return "rel_type" in relatesTo && typeof relatesTo.rel_type === "string" ? relatesTo.rel_type : undefined;
}

export async function createBlackoutSignalEventContent(
    roomId: string,
    messageContent: RoomMessageEventContent,
    threadId: string | null,
): Promise<BlackoutSignalEventContent> {
    const canonicalPayload = JSON.stringify(messageContent);
    const payloadHash = await sha256(canonicalPayload);

    return {
        message_id: uuidv4(),
        hash: `sha256:${payloadHash}`,
        size: new TextEncoder().encode(canonicalPayload).length,
        content_type: messageContent.msgtype ?? "m.text",
        room_id: roomId,
        routing_metadata: {
            relation_type: getRelationType(messageContent),
            thread_id: threadId,
        },
    };
}

export async function sendBlackoutSignalEvent(
    mxClient: MatrixClient,
    roomId: string,
    messageContent: RoomMessageEventContent,
    threadId: string | null,
): Promise<void> {
    const signalContent = await createBlackoutSignalEventContent(roomId, messageContent, threadId);
    if (!isBlackoutSignalEventContent(signalContent)) {
        throw new Error("Generated blackout signal event content failed schema validation");
    }

    try {
        await mxClient.sendEvent(roomId, BLACKOUT_SIGNAL_EVENT_TYPE as never, signalContent as never);
    } catch (error) {
        logger.warn("Failed to send m.blackout.signal metadata event", error);
    }
}
