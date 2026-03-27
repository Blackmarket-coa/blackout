/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { segmentEmojis } from "./EmojiStego";
import { STEGO_MARKER } from "./types";

const CHUNK_PREFIX = "mxstego:v1:";

export interface StegoCarrierChunk {
    index: number;
    total: number;
    payload: string;
}

/**
 * Deterministically split an emoji carrier into stable ordered chunks.
 */
export function chunkEmojiCarrier(carrier: string, maxEmojisPerChunk: number): string[] {
    if (!Number.isInteger(maxEmojisPerChunk) || maxEmojisPerChunk <= 0) {
        throw new Error("maxEmojisPerChunk must be a positive integer");
    }

    const stripped = carrier.startsWith(STEGO_MARKER) ? carrier.slice(STEGO_MARKER.length) : carrier;
    const emojis = segmentEmojis(stripped);
    if (emojis.length === 0) {
        throw new Error("Carrier does not contain a stego emoji payload");
    }

    const total = Math.ceil(emojis.length / maxEmojisPerChunk);
    const chunks: string[] = [];

    for (let i = 0; i < total; i++) {
        const start = i * maxEmojisPerChunk;
        const end = Math.min(start + maxEmojisPerChunk, emojis.length);
        const payload = emojis.slice(start, end).join("");
        chunks.push(`${CHUNK_PREFIX}${i + 1}/${total}:${payload}`);
    }

    return chunks;
}

/** Parse a chunk string and return metadata + payload. */
export function parseCarrierChunk(chunk: string): StegoCarrierChunk {
    if (!chunk.startsWith(CHUNK_PREFIX)) {
        throw new Error("Invalid chunk prefix");
    }

    const rest = chunk.slice(CHUNK_PREFIX.length);
    const separator = rest.indexOf(":");
    if (separator < 0) {
        throw new Error("Chunk is missing payload separator");
    }

    const indexPart = rest.slice(0, separator);
    const payload = rest.slice(separator + 1);
    const match = indexPart.match(/^(\d+)\/(\d+)$/);
    if (!match) {
        throw new Error("Invalid chunk index format");
    }

    const index = Number(match[1]);
    const total = Number(match[2]);
    if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || total < 1 || index > total) {
        throw new Error("Invalid chunk index values");
    }

    return { index, total, payload };
}

/**
 * Reassemble deterministic chunks back into a full stego emoji carrier.
 */
export function reassembleEmojiCarrier(chunks: readonly string[]): string {
    if (chunks.length === 0) {
        throw new Error("No chunks provided");
    }

    const parsed = chunks.map(parseCarrierChunk);
    const total = parsed[0].total;

    if (!parsed.every((c) => c.total === total)) {
        throw new Error("Inconsistent chunk total counts");
    }

    if (parsed.length !== total) {
        throw new Error(`Expected ${total} chunks but received ${parsed.length}`);
    }

    parsed.sort((a, b) => a.index - b.index);

    for (let i = 0; i < parsed.length; i++) {
        if (parsed[i].index !== i + 1) {
            throw new Error("Missing or duplicate chunk indices");
        }
    }

    return STEGO_MARKER + parsed.map((c) => c.payload).join("");
}
