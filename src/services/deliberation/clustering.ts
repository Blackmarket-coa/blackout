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

function recomputeCentroid(vectors: OpinionVector[]): number[] {
    const total = new Array(vectors[0].values.length).fill(0);

    for (const vector of vectors) {
        for (let index = 0; index < vector.values.length; index += 1) {
            total[index] += vector.values[index];
        }
    }

    return total.map((value) => value / vectors.length);
}

export function clusterOpinions(vectors: OpinionVector[], config: ClusterConfig = {}): OpinionCluster[] {
    const similarityThreshold = config.similarityThreshold ?? 0.85;
    const minimumVectorLength = config.minimumVectorLength ?? 1;

    const validVectors = vectors
        .filter((vector) => vector.values.length >= minimumVectorLength)
        .sort((a, b) => a.userId.localeCompare(b.userId));

    if (validVectors.length === 0) {
        return [];
    }

    const clusterBuckets: OpinionVector[][] = [];

    for (const vector of validVectors) {
        const matchingBucket = clusterBuckets.find((bucket) => {
            const centroid = recomputeCentroid(bucket);
            return cosineSimilarity(vector.values, centroid) >= similarityThreshold;
        });

        if (matchingBucket) {
            matchingBucket.push(vector);
        } else {
            clusterBuckets.push([vector]);
        }
    }

    return clusterBuckets
        .map((bucket, index) => ({
            id: `cluster-${index + 1}`,
            memberIds: bucket.map((vector) => vector.userId).sort((a, b) => a.localeCompare(b)),
            centroid: recomputeCentroid(bucket),
        }))
        .sort((a, b) => a.memberIds[0].localeCompare(b.memberIds[0]));
}
