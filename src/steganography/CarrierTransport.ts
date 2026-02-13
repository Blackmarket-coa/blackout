/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { chunkEmojiCarrier, reassembleEmojiCarrier } from "./CarrierChunking";
import { validateCarrierCompatibility } from "./CarrierCompatibility";
import { StegoStrategy } from "./types";

const CHUNK_PREFIX = "mxstego:v1:";
const MAX_CHUNK_COUNT = 32;

/**
 * Prepare an encoded carrier for transport in Matrix text events.
 *
 * Emoji carriers are validated, deterministically chunked and serialized with
 * stable chunk headers. Image carriers are returned unchanged.
 */
export function prepareCarrierForTransport(
    carrier: string,
    strategy: StegoStrategy,
    maxEmojisPerChunk = 120,
): { carrier: string; chunked: boolean; chunkCount: number } {
    if (strategy === StegoStrategy.Image) {
        return { carrier, chunked: false, chunkCount: 1 };
    }

    const compatibility = validateCarrierCompatibility(carrier);
    if (!compatibility.compatible) {
        throw new Error(`Carrier compatibility validation failed: ${compatibility.issues.join("; ")}`);
    }

    const chunks = chunkEmojiCarrier(carrier, maxEmojisPerChunk);
    if (chunks.length > MAX_CHUNK_COUNT) {
        throw new Error(`Carrier exceeds transport chunk cap (${MAX_CHUNK_COUNT})`);
    }

    return {
        carrier: chunks.join("\n"),
        chunked: chunks.length > 1,
        chunkCount: chunks.length,
    };
}

/**
 * Normalize an incoming carrier for decoding.
 *
 * If chunked emoji lines are detected, they are reassembled into a canonical
 * stego carrier; otherwise the input is returned unchanged.
 */
export function normalizeIncomingCarrier(rawCarrier: string): string {
    if (rawCarrier.startsWith("data:image/png")) {
        return rawCarrier;
    }

    const lines = rawCarrier
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    if (lines.length === 0) {
        return rawCarrier;
    }

    const allChunkLines = lines.every((line) => line.startsWith(CHUNK_PREFIX));
    if (!allChunkLines) {
        return rawCarrier;
    }

    try {
        return reassembleEmojiCarrier(lines);
    } catch {
        return rawCarrier;
    }
}
