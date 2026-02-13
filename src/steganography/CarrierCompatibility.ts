/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { segmentEmojis } from "./EmojiStego";
import { EMOJI_POOL, STEGO_MARKER } from "./types";

const CHUNK_HEADER_REGEX = /^mxstego:v1:\d+\/\d+:/;

export interface CarrierCompatibilityReport {
    compatible: boolean;
    issues: string[];
    emojiCount: number;
}

/**
 * Validate that a carrier uses platform-safe characters and stable normalization.
 */
export function validateCarrierCompatibility(carrier: string): CarrierCompatibilityReport {
    const issues: string[] = [];

    const nfc = carrier.normalize("NFC");
    if (nfc !== carrier) {
        issues.push("Carrier is not NFC-normalized");
    }

    let payload = carrier;
    if (payload.startsWith(STEGO_MARKER)) {
        payload = payload.slice(STEGO_MARKER.length);
    }

    payload = payload.replace(CHUNK_HEADER_REGEX, "");

    const hasDisallowedControlChars = Array.from(payload).some((char) => {
        const code = char.codePointAt(0) ?? 0;
        return code <= 0x1f || code === 0x7f;
    });
    if (hasDisallowedControlChars) {
        issues.push("Carrier contains disallowed control characters");
    }

    const segmented = segmentEmojis(payload);
    if (segmented.length === 0) {
        issues.push("Carrier does not contain any known stego emojis");
    }

    const reconstructed = segmented.join("");
    if (reconstructed !== payload) {
        issues.push("Carrier contains characters outside the supported emoji set");
    }

    const set = new Set(EMOJI_POOL);
    for (const emoji of segmented) {
        if (!set.has(emoji)) {
            issues.push(`Unsupported emoji in carrier: ${emoji}`);
            break;
        }
    }

    return {
        compatible: issues.length === 0,
        issues,
        emojiCount: segmented.length,
    };
}
