/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export interface OpinionVector {
    userId: string;
    values: number[];
}

export interface OpinionCluster {
    id: string;
    memberIds: string[];
    centroid: number[];
}

export interface ClusterConfig {
    similarityThreshold?: number;
    minimumVectorLength?: number;
}

interface ClusterBucket {
    vectors: OpinionVector[];
    total: number[];
}

function isFiniteNumber(value: number): boolean {
    return Number.isFinite(value);
}

function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let aMagnitude = 0;
    let bMagnitude = 0;

    for (let index = 0; index < a.length; index += 1) {
        dot += a[index] * b[index];
        aMagnitude += a[index] * a[index];
        bMagnitude += b[index] * b[index];
    }

    if (aMagnitude === 0 || bMagnitude === 0) {
        return 0;
    }

    return dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude));
}

export function clusterOpinions(vectors: OpinionVector[], config: ClusterConfig = {}): OpinionCluster[] {
    const similarityThreshold = config.similarityThreshold ?? 0.85;
    const minimumVectorLength = config.minimumVectorLength ?? 1;

    if (!Number.isFinite(similarityThreshold) || similarityThreshold < -1 || similarityThreshold > 1) {
        throw new Error("similarityThreshold must be a finite number between -1 and 1");
    }

    if (!Number.isInteger(minimumVectorLength) || minimumVectorLength <= 0) {
        throw new Error("minimumVectorLength must be a positive integer");
    }

    const seenUserIds = new Set<string>();
    const normalizedVectors: OpinionVector[] = [];
    let expectedLength: number | undefined;

    for (const vector of vectors) {
        if (!vector.userId) {
            continue;
        }

        if (seenUserIds.has(vector.userId)) {
            continue;
        }

        if (vector.values.length < minimumVectorLength) {
            continue;
        }

        if (!vector.values.every(isFiniteNumber)) {
            continue;
        }

        if (expectedLength === undefined) {
            expectedLength = vector.values.length;
        }

        if (vector.values.length !== expectedLength) {
            continue;
        }

        seenUserIds.add(vector.userId);
        normalizedVectors.push(vector);
    }

    const validVectors = normalizedVectors.sort((a, b) => a.userId.localeCompare(b.userId));

    if (validVectors.length === 0) {
        return [];
    }

    const clusterBuckets: ClusterBucket[] = [];

    for (const vector of validVectors) {
        const matchingBucket = clusterBuckets.find((bucket) => {
            const centroid = bucket.total.map((value) => value / bucket.vectors.length);
            return cosineSimilarity(vector.values, centroid) >= similarityThreshold;
        });

        if (matchingBucket) {
            matchingBucket.vectors.push(vector);
            for (let index = 0; index < vector.values.length; index += 1) {
                matchingBucket.total[index] += vector.values[index];
            }
        } else {
            clusterBuckets.push({ vectors: [vector], total: [...vector.values] });
        }
    }

    return clusterBuckets
        .map((bucket, index) => ({
            id: `cluster-${index + 1}`,
            memberIds: bucket.vectors.map((vector) => vector.userId).sort((a, b) => a.localeCompare(b)),
            centroid: bucket.total.map((value) => value / bucket.vectors.length),
        }))
        .sort((a, b) => a.memberIds[0].localeCompare(b.memberIds[0]));
}
