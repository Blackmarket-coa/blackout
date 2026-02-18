/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixClient, type ISendEventResponse } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { RTCSignalingManager } from "./rtcSignaling";

export interface SendWithRtcFallbackOptions {
    content: unknown;
    featureEnabled: boolean;
    matrixSend: () => Promise<ISendEventResponse>;
    maxRtcRetries?: number;
    mxClient: MatrixClient;
    roomId: string;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function rtcRuntimeAvailable(): boolean {
    return typeof globalThis.RTCPeerConnection !== "undefined";
}

export async function sendWithRtcFallback(options: SendWithRtcFallbackOptions): Promise<ISendEventResponse> {
    const { featureEnabled, roomId, mxClient, matrixSend, content } = options;

    if (!featureEnabled || !rtcRuntimeAvailable()) {
        return matrixSend();
    }

    await RTCSignalingManager.instance.syncRoomPeers(mxClient, roomId);

    const serialized = JSON.stringify(content);
    const maxRetries = options.maxRtcRetries ?? 2;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const delivered = RTCSignalingManager.instance.sendPayload(roomId, serialized);
        if (delivered.length > 0) {
            return { event_id: mxClient.makeTxnId() } as ISendEventResponse;
        }

        await sleep((attempt + 1) * 250);
    }

    logger.warn("RTC payload delivery unavailable; falling back to Matrix send", { roomId, maxRetries });
    return matrixSend();
}
