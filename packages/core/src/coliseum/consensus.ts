import type { ColiseumArgument, ColiseumVote } from './feed';

/**
 * Clean-room TypeScript port of the Polis consensus model
 * (https://github.com/compdemocracy/polis, AGPL-3.0).
 *
 * The shape:
 *   1. Build a sparse vote matrix (voters × arguments) with +1 / -1 / 0 cells.
 *   2. Cluster voters with k-means using k-means++ seeded init.
 *   3. For each argument compute agree-rate per cluster.
 *   4. The "consensus" score for an argument is the *minimum* agree-rate
 *      across clusters — i.e. the argument is endorsed by every faction.
 *
 * This is what powers "community-chosen winner with room for nuance":
 * an argument can win without dominating any single bloc, by being broadly
 * acceptable across blocs. See POLIS_ATTRIBUTION.md.
 */

export interface VoteMatrix {
    voterIds: string[];
    argumentIds: string[];
    /** rows × cols, values in {-1, 0, +1}. */
    rows: Int8Array[];
}

export function buildVoteMatrix(
    args: ReadonlyArray<ColiseumArgument>,
    votes: ReadonlyArray<ColiseumVote>,
): VoteMatrix {
    const voterIds = [...new Set(votes.map((v) => v.voterId))].sort();
    const argumentIds = args.map((a) => a.id);
    const argIndex = new Map(argumentIds.map((id, i) => [id, i]));
    const voterIndex = new Map(voterIds.map((id, i) => [id, i]));

    const rows: Int8Array[] = voterIds.map(() => new Int8Array(argumentIds.length));
    for (const vote of votes) {
        const r = voterIndex.get(vote.voterId);
        const c = argIndex.get(vote.argumentId);
        if (r === undefined || c === undefined) continue;
        rows[r]![c] = vote.direction === 'up' ? 1 : -1;
    }
    return { voterIds, argumentIds, rows };
}

/**
 * Mulberry32 — small, fast, deterministic 32-bit PRNG. Good enough for
 * k-means++ init. Used by tests via the `seed` option to keep clustering
 * reproducible.
 */
function makeRng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function squaredDistance(a: ArrayLike<number>, b: ArrayLike<number>): number {
    let s = 0;
    for (let i = 0; i < a.length; i += 1) {
        const d = a[i]! - b[i]!;
        s += d * d;
    }
    return s;
}

function chooseInitialCentroids(
    rows: ReadonlyArray<ArrayLike<number>>,
    k: number,
    rng: () => number,
): number[][] {
    const n = rows.length;
    if (n === 0 || k <= 0) return [];
    const firstIndex = Math.min(n - 1, Math.floor(rng() * n));
    const centroids: number[][] = [Array.from(rows[firstIndex]!) as number[]];
    const distances = new Float64Array(n).fill(Infinity);

    while (centroids.length < k) {
        const last = centroids[centroids.length - 1]!;
        let total = 0;
        for (let i = 0; i < n; i += 1) {
            const d = squaredDistance(rows[i]!, last);
            if (d < distances[i]!) distances[i] = d;
            total += distances[i]!;
        }
        if (total === 0) {
            const idx = Math.min(n - 1, Math.floor(rng() * n));
            centroids.push(Array.from(rows[idx]!) as number[]);
            continue;
        }
        let target = rng() * total;
        let chosen = 0;
        for (let i = 0; i < n; i += 1) {
            target -= distances[i]!;
            if (target <= 0) {
                chosen = i;
                break;
            }
        }
        centroids.push(Array.from(rows[chosen]!) as number[]);
    }
    return centroids;
}

export interface KMeansOptions {
    k?: number;
    seed?: number;
    maxIterations?: number;
}

export interface KMeansResult {
    /** Cluster assignment per voter (parallel to VoteMatrix.voterIds). */
    assignments: number[];
    centroids: number[][];
    iterations: number;
}

export function kmeansCluster(matrix: VoteMatrix, options: KMeansOptions = {}): KMeansResult {
    const { rows } = matrix;
    const desiredK = options.k ?? 3;
    const seed = options.seed ?? 0xc0deba5e;
    const maxIterations = options.maxIterations ?? 50;

    if (rows.length === 0) {
        return { assignments: [], centroids: [], iterations: 0 };
    }
    const k = Math.max(1, Math.min(desiredK, rows.length));

    const rng = makeRng(seed);
    let centroids = chooseInitialCentroids(rows, k, rng);
    const assignments = new Array<number>(rows.length).fill(0);
    const dim = matrix.argumentIds.length;

    let iterations = 0;
    for (; iterations < maxIterations; iterations += 1) {
        let changed = false;
        for (let i = 0; i < rows.length; i += 1) {
            let bestCluster = 0;
            let bestDistance = Infinity;
            for (let c = 0; c < centroids.length; c += 1) {
                const d = squaredDistance(rows[i]!, centroids[c]!);
                if (d < bestDistance) {
                    bestDistance = d;
                    bestCluster = c;
                }
            }
            if (assignments[i] !== bestCluster) {
                assignments[i] = bestCluster;
                changed = true;
            }
        }

        const sums: number[][] = Array.from({ length: centroids.length }, () =>
            new Array(dim).fill(0),
        );
        const counts = new Array<number>(centroids.length).fill(0);
        for (let i = 0; i < rows.length; i += 1) {
            const cluster = assignments[i]!;
            counts[cluster] += 1;
            for (let d = 0; d < dim; d += 1) {
                sums[cluster]![d] += rows[i]![d]!;
            }
        }
        const next: number[][] = centroids.map((centroid, c) => {
            if (counts[c] === 0) return centroid;
            return sums[c]!.map((value) => value / counts[c]!);
        });
        centroids = next;

        if (!changed) {
            iterations += 1;
            break;
        }
    }

    return { assignments, centroids, iterations };
}

export interface ConsensusReport {
    /** argumentId → consensus score in [0, 1]. */
    consensusByArgument: Map<string, number>;
    /** argumentId → array of agree-rates per cluster. */
    agreeRatesByArgument: Map<string, number[]>;
    clusterSizes: number[];
}

/**
 * Compute per-argument cross-cluster consensus given a clustering of voters.
 *
 * agreeRate[argument][cluster] = (#up - #down) / clusterSize within that cluster
 *                                 (clipped to [0, 1] by treating negatives as 0)
 * consensus[argument]           = min(agreeRate over clusters)
 *
 * That min-aggregation is the Polis insight: an argument that 60% of every
 * cluster supports outranks one that 90% of one cluster supports and 5% of the
 * other endorses.
 */
export function computeConsensus(
    matrix: VoteMatrix,
    cluster: KMeansResult,
): ConsensusReport {
    const { argumentIds, rows } = matrix;
    const numClusters = Math.max(1, cluster.centroids.length);

    const clusterSizes = new Array<number>(numClusters).fill(0);
    for (const a of cluster.assignments) {
        if (a >= 0 && a < numClusters) clusterSizes[a] += 1;
    }

    const agreeRatesByArgument = new Map<string, number[]>();
    const consensusByArgument = new Map<string, number>();

    for (let c = 0; c < argumentIds.length; c += 1) {
        const argId = argumentIds[c]!;
        const upPerCluster = new Array<number>(numClusters).fill(0);
        const downPerCluster = new Array<number>(numClusters).fill(0);

        for (let r = 0; r < rows.length; r += 1) {
            const cell = rows[r]![c]!;
            if (cell === 0) continue;
            const cluster_ = cluster.assignments[r]!;
            if (cell > 0) upPerCluster[cluster_] += 1;
            else downPerCluster[cluster_] += 1;
        }

        const agreeRates: number[] = [];
        const nonEmptyRates: number[] = [];
        for (let i = 0; i < numClusters; i += 1) {
            const size = clusterSizes[i]!;
            if (size === 0) {
                // Empty cluster contributes no signal; surface 0 in the per-cluster
                // diagnostic but exclude it from the consensus aggregation so an
                // unused k value doesn't collapse every argument to 0.
                agreeRates.push(0);
                continue;
            }
            const net = upPerCluster[i]! - downPerCluster[i]!;
            const rate = net <= 0 ? 0 : net / size;
            const clipped = rate > 1 ? 1 : rate;
            agreeRates.push(clipped);
            nonEmptyRates.push(clipped);
        }

        agreeRatesByArgument.set(argId, agreeRates);
        consensusByArgument.set(
            argId,
            nonEmptyRates.length === 0 ? 0 : Math.min(...nonEmptyRates),
        );
    }

    return { consensusByArgument, agreeRatesByArgument, clusterSizes };
}

export interface ColiseumWinnerVerdictInput {
    topicId: string;
    arguments: ReadonlyArray<ColiseumArgument>;
    votes: ReadonlyArray<ColiseumVote>;
    nowMs?: number;
    /** PRNG seed for k-means init; defaults to a constant for reproducibility. */
    seed?: number;
    /** Number of clusters to fit; defaults to 3. Auto-clamped to <= voter count. */
    k?: number;
    /** How many runners-up to surface. */
    runnersUpLimit?: number;
}

export interface ColiseumWinnerVerdictResult {
    topicId: string;
    winningArgumentId: string | null;
    runnersUp: string[];
    consensusArgumentIds: string[];
    computedAt: string;
    model: 'coliseum_polis_v1';
    /** Diagnostic: per-argument consensus map (exposed for verdict UI). */
    consensusByArgument: Record<string, number>;
}

/**
 * Compose clustering + consensus into a topic-level verdict.
 *
 * Winner = argmax of (voteScore × (1 + consensus)) — this rewards consensus
 * but never lets a popular-but-divisive argument lose to one with no votes.
 * Runners-up = next N by the same metric.
 * consensusArgumentIds = arguments with consensus ≥ 0.5 (broad cross-cluster
 *                        endorsement), in descending order.
 */
export function deriveColiseumWinnerVerdict(
    input: ColiseumWinnerVerdictInput,
): ColiseumWinnerVerdictResult {
    const computedAt = new Date(input.nowMs ?? Date.now()).toISOString();
    if (input.arguments.length === 0) {
        return {
            topicId: input.topicId,
            winningArgumentId: null,
            runnersUp: [],
            consensusArgumentIds: [],
            computedAt,
            model: 'coliseum_polis_v1',
            consensusByArgument: {},
        };
    }

    const matrix = buildVoteMatrix(input.arguments, input.votes);
    const cluster = kmeansCluster(matrix, { k: input.k ?? 3, seed: input.seed });
    const consensus = computeConsensus(matrix, cluster);

    const consensusByArgument: Record<string, number> = {};
    for (const arg of input.arguments) {
        consensusByArgument[arg.id] = consensus.consensusByArgument.get(arg.id) ?? 0;
    }

    const ranked = [...input.arguments].sort((a, b) => {
        const ca = consensusByArgument[a.id] ?? 0;
        const cb = consensusByArgument[b.id] ?? 0;
        return b.voteScore * (1 + cb) - a.voteScore * (1 + ca);
    });

    const winner = ranked[0]!;
    const runnersUpLimit = input.runnersUpLimit ?? 3;
    const runnersUp = ranked.slice(1, 1 + runnersUpLimit).map((a) => a.id);

    const consensusArgumentIds = [...input.arguments]
        .map((a) => ({ id: a.id, c: consensusByArgument[a.id] ?? 0 }))
        .filter((entry) => entry.c >= 0.5)
        .sort((a, b) => b.c - a.c)
        .map((entry) => entry.id);

    return {
        topicId: input.topicId,
        winningArgumentId: winner.id,
        runnersUp,
        consensusArgumentIds,
        computedAt,
        model: 'coliseum_polis_v1',
        consensusByArgument,
    };
}
