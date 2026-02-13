/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { createHash } from "crypto";

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
        algorithm: "sha256-xof-draw";
        seedMaterial: string;
        seedHash: string;
        drawHashes: string[];
    };
}

const hashHex = (input: string): string => createHash("sha256").update(input).digest("hex");

const compareLexicographically = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

export function selectDeterministicJury(
    participants: SortitionParticipant[],
    seed: SortitionSeedInput,
    policy: SortitionPolicy,
): SortitionResult {
    if (!Number.isInteger(policy.jurySize) || policy.jurySize <= 0) {
        throw new Error("Sortition jurySize must be a positive integer");
    }

    const excluded = new Set(policy.excludedUserIds ?? []);

    const participantByUserId = new Map<string, SortitionParticipant>();
    participants.forEach((participant) => {
        if (!participant.userId) {
            throw new Error("Sortition participants must have a non-empty userId");
        }

        if (participantByUserId.has(participant.userId)) {
            throw new Error(`Duplicate participant for sortition: ${participant.userId}`);
        }

        participantByUserId.set(participant.userId, participant);
    });

    const eligible = [...participantByUserId.values()]
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

    const selected = draws.slice(0, jurySize);

    return {
        selectedJurorIds: selected.map((entry) => entry.userId),
        eligibleCount: eligible.length,
        policy: {
            jurySize,
            minPowerLevel: policy.minPowerLevel,
            excludedUserIds: policy.excludedUserIds,
            requireActive: policy.requireActive,
        },
        proof: {
            algorithm: "sha256-xof-draw",
            seedMaterial,
            seedHash,
            drawHashes: selected.map((entry) => entry.drawHash),
        },
    };
}
