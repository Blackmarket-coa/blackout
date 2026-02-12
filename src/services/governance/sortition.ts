/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { xxHash32 } from "js-xxhash";

export interface SortitionParticipant {
    userId: string;
    powerLevel?: number;
    isActive?: boolean;
}

export interface SortitionPolicy {
    jurySize: number;
    minPowerLevel?: number;
    excludedUserIds?: string[];
    requireActive?: boolean;
}

export interface SortitionSeedInput {
    roomId: string;
    proposalId: string;
    eventId: string;
    timestampMs: number;
}

export interface SortitionResult {
    selectedJurorIds: string[];
    eligibleCount: number;
    policy: SortitionPolicy;
    proof: {
        algorithm: "xxhash32-draw";
        seedMaterial: string;
        seedHash: string;
        drawHashes: string[];
    };
}

const compareLexicographically = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const normalizeHash = (hash: number): string => hash.toString(16).padStart(8, "0");

const hashHex = (input: string, seed = 0): string => normalizeHash(xxHash32(input, seed));

export function selectDeterministicJury(
    participants: SortitionParticipant[],
    seed: SortitionSeedInput,
    policy: SortitionPolicy,
): SortitionResult {
    if (!Number.isInteger(policy.jurySize) || policy.jurySize <= 0) {
        throw new Error("Sortition jurySize must be a positive integer");
    }

    const excluded = new Set(policy.excludedUserIds ?? []);

    const eligible = [...new Set(participants.map((participant) => participant.userId))]
        .map((userId) => participants.find((participant) => participant.userId === userId))
        .filter((participant): participant is SortitionParticipant => Boolean(participant))
        .filter((participant) => !excluded.has(participant.userId))
        .filter((participant) =>
            policy.minPowerLevel === undefined ? true : (participant.powerLevel ?? 0) >= policy.minPowerLevel,
        )
        .filter((participant) => (policy.requireActive ? participant.isActive !== false : true))
        .map((participant) => participant.userId)
        .sort(compareLexicographically);

    if (!eligible.length) {
        throw new Error("No eligible participants for sortition");
    }

    const jurySize = Math.min(policy.jurySize, eligible.length);
    const seedMaterial = `${seed.roomId}|${seed.proposalId}|${seed.eventId}|${seed.timestampMs}`;
    const seedHash = hashHex(seedMaterial);

    const draws = eligible
        .map((userId) => ({
            userId,
            drawHash: hashHex(`${seedHash}|${userId}`),
        }))
        .sort((left, right) => {
            const hashOrder = compareLexicographically(left.drawHash, right.drawHash);
            return hashOrder !== 0 ? hashOrder : compareLexicographically(left.userId, right.userId);
        });

    return {
        selectedJurorIds: draws.slice(0, jurySize).map((entry) => entry.userId),
        eligibleCount: eligible.length,
        policy: {
            jurySize,
            minPowerLevel: policy.minPowerLevel,
            excludedUserIds: policy.excludedUserIds,
            requireActive: policy.requireActive,
        },
        proof: {
            algorithm: "xxhash32-draw",
            seedMaterial,
            seedHash,
            drawHashes: draws.map((entry) => entry.drawHash),
        },
    };
}
