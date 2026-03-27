/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { createHash } from "crypto";
import { type MatrixClient, MsgType } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";
import { type RoomMessageEventContent } from "matrix-js-sdk/src/types";
import { v4 as uuidv4 } from "uuid";

import { canEnableMetadataOnlyMatrixMode, getCutoverReadiness } from "./cutoverGate";
import { getEncryptedPayloadStore } from "./payloadStore";
import { RTCSignalingManager } from "./rtcSignaling";
import { sendWithRtcFallback } from "./rtcFallbackRouter";

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
    schema_version: 1;
    size: number;
}

interface BlackoutSignalTelemetryCounters {
    attempted: number;
    failed: number;
    metadata_only_mode: number;
    sent: number;
    skipped_feature_disabled: number;
    skipped_invalid_content: number;
    skipped_non_attachment: number;
    stored_local_payload: number;
}

const telemetry: BlackoutSignalTelemetryCounters = {
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped_feature_disabled: 0,
    skipped_non_attachment: 0,
    skipped_invalid_content: 0,
    metadata_only_mode: 0,
    stored_local_payload: 0,
};

const SHA256_REGEX = /^sha256:[a-f0-9]{64}$/;
function fallbackTxnId(): string {
    return `blackout-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function recordTelemetry(key: keyof BlackoutSignalTelemetryCounters): void {
    telemetry[key] += 1;
}

export function getBlackoutSignalTelemetrySnapshot(): Readonly<BlackoutSignalTelemetryCounters> {
    return { ...telemetry };
}

export function isAttachmentMessageType(contentType: string | undefined): boolean {
    return [MsgType.File, MsgType.Image, MsgType.Audio, MsgType.Video].includes(contentType as MsgType);
}

export function isBlackoutSignalEventContent(content: unknown): content is BlackoutSignalEventContent {
    if (!content || typeof content !== "object") return false;

    const candidate = content as Partial<BlackoutSignalEventContent>;

    if (candidate.schema_version !== 1) return false;
    if (typeof candidate.message_id !== "string" || !UUID_REGEX.test(candidate.message_id)) return false;
    if (typeof candidate.hash !== "string" || !SHA256_REGEX.test(candidate.hash)) return false;
    if (typeof candidate.size !== "number" || !Number.isInteger(candidate.size) || candidate.size < 0) return false;
    if (typeof candidate.content_type !== "string" || candidate.content_type.length === 0) return false;
    if (typeof candidate.room_id !== "string" || candidate.room_id.length === 0) return false;

    if (candidate.routing_metadata && typeof candidate.routing_metadata === "object") {
        const routing = candidate.routing_metadata;
        if (routing.relation_type != null && typeof routing.relation_type !== "string") return false;
        if (routing.thread_id != null && typeof routing.thread_id !== "string") return false;
    }

    return true;
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
        schema_version: 1,
        message_id: uuidv4(),
        hash: `sha256:${payloadHash}`,
        size: new TextEncoder().encode(canonicalPayload).length,
        content_type: messageContent.msgtype ?? MsgType.Text,
        room_id: roomId,
        routing_metadata: {
            relation_type: getRelationType(messageContent),
            thread_id: threadId,
        },
    };
}

async function persistEncryptedPayloadLocally(
    roomId: string,
    signal: BlackoutSignalEventContent,
    content: unknown,
): Promise<void> {
    const payloadStore = getEncryptedPayloadStore();
    await payloadStore.put(roomId, signal.message_id, JSON.stringify(content));
    recordTelemetry("stored_local_payload");
}

export async function sendBlackoutSignalEvent(
    mxClient: MatrixClient,
    roomId: string,
    messageContent: RoomMessageEventContent,
    threadId: string | null,
): Promise<void> {
    recordTelemetry("attempted");
    RTCSignalingManager.instance.registerClient(mxClient);

    const signalContent = await createBlackoutSignalEventContent(roomId, messageContent, threadId);
    if (!isBlackoutSignalEventContent(signalContent)) {
        recordTelemetry("skipped_invalid_content");
        throw new Error("Generated blackout signal event content failed schema validation");
    }

    await persistEncryptedPayloadLocally(roomId, signalContent, messageContent);

    try {
        await mxClient.sendEvent(roomId, BLACKOUT_SIGNAL_EVENT_TYPE as never, signalContent as never);
        recordTelemetry("sent");
    } catch (error) {
        recordTelemetry("failed");
        logger.warn("Failed to send m.blackout.signal metadata event", error);
    }
}

export async function maybeSendBlackoutSignalEventForAttachment(
    mxClient: MatrixClient,
    roomId: string,
    messageContent: RoomMessageEventContent,
    threadId: string | null,
    featureEnabled: boolean,
): Promise<void> {
    if (!featureEnabled) {
        recordTelemetry("skipped_feature_disabled");
        return;
    }

    if (!isAttachmentMessageType(messageContent.msgtype)) {
        recordTelemetry("skipped_non_attachment");
        return;
    }

    try {
        await sendBlackoutSignalEvent(mxClient, roomId, messageContent, threadId);
    } catch (error) {
        logger.warn("Blackout signal attachment dual-write failed", error);
    }
}

export async function maybeSendBlackoutSignalEventForMessage(
    mxClient: MatrixClient,
    roomId: string,
    messageContent: RoomMessageEventContent,
    threadId: string | null,
    featureEnabled: boolean,
): Promise<void> {
    if (!featureEnabled) {
        recordTelemetry("skipped_feature_disabled");
        return;
    }

    try {
        await sendWithRtcFallback({
            roomId,
            content: messageContent,
            featureEnabled,
            mxClient,
            matrixSend: async () => {
                await sendBlackoutSignalEvent(mxClient, roomId, messageContent, threadId);
                return { event_id: (mxClient as any).makeTxnId?.() ?? fallbackTxnId() };
            },
            maxRtcRetries: 2,
        });
    } catch (error) {
        logger.warn("Blackout signal message dual-write failed", error);
    }
}

export function isMetadataOnlyMatrixModeEnabled(featureEnabled: boolean): boolean {
    const readiness = getCutoverReadiness(featureEnabled);
    const enabled = canEnableMetadataOnlyMatrixMode(readiness);
    if (enabled) {
        recordTelemetry("metadata_only_mode");
    }
    return enabled;
}
