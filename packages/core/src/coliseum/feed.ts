import { citationDepthScore, type ColiseumArgumentMedia, type ColiseumCitation } from './citations';
import {
    deriveColiseumTopicStatus,
    type ColiseumTopicStatus,
    type ColiseumTopicTimeline,
} from './status';
import { normalizeColiseumCategoryKey, type ColiseumTopicCategoryKey } from './taxonomy';
import {
    resolveTopicSeed,
    seedPublishedAt,
    seedToNewsAnchor,
    type ColiseumLinkSeedSource,
    type ColiseumTopicSeed,
} from './seed';

export type ColiseumNewsAnchor = ColiseumLinkSeedSource;

export interface ColiseumTopic {
    id: string;
    title: string;
    /**
     * How this topic was proposed — text, link, media, or challenge. The single
     * intake shape that Matches, Shouts and news-anchored debates all collapse
     * into.
     */
    seed: ColiseumTopicSeed;
    /**
     * @deprecated Derived from a `link` seed. Retained so readers written
     * before seeds keep working; switch on `seed.kind` in new code.
     */
    newsAnchor?: ColiseumNewsAnchor;
    /**
     * The canopy den backing this topic's free-form discussion, created lazily
     * on the first comment. Distinct from `denId`, which records which den the
     * topic was *posted in* and is only ever a scope filter.
     */
    discussionDenId?: string;
    createdAt: string;
    closesAt?: string;
    archivesAt?: string;
    tags: string[];
    category?: ColiseumTopicCategoryKey;
    canopyId?: string;
    denId?: string;
    status: ColiseumTopicStatus;
    /** 0..1 — HN-style recency gravity. */
    recencyScore: number;
    /** 0..1 — arguments+votes per hour, normalized. */
    velocityScore: number;
    /** 0..1 — bounded blend of recency × velocity. */
    debateHeat: number;
}

export type ColiseumStance = 'for' | 'against' | 'nuance';

export const COLISEUM_STANCES: readonly ColiseumStance[] = ['for', 'against', 'nuance'] as const;

export interface ColiseumArgument {
    id: string;
    topicId: string;
    /** When set, this argument rebuts another argument on the same topic, forming a chain. */
    parentArgumentId?: string;
    authorId: string;
    stance: ColiseumStance;
    /** 0..1 — distance from a pure for/against position. 1 = pure stance, 0 = pure nuance. */
    stanceWeight: number;
    body: string;
    citations: ColiseumCitation[];
    /** Optional short-form video, enabling the vertical reel presentation. */
    media?: ColiseumArgumentMedia;
    createdAt: string;
    /** Wilson lower bound on up/(up+down) — 0..1. */
    voteScore: number;
    /** Polis-style cross-cluster consensus — 0..1. */
    nuanceScore: number;
}

export interface ColiseumVote {
    argumentId: string;
    voterId: string;
    direction: 'up' | 'down';
    /** Optional richer signal in [-1, +1]; positive shifts toward 'for', negative toward 'against'. */
    stanceShift?: number;
    createdAt: string;
}

export interface ColiseumWinnerVerdict {
    topicId: string;
    winningArgumentId: string;
    runnersUp: string[];
    /** Argument ids that earned cross-cluster agreement. */
    consensusArgumentIds: string[];
    computedAt: string;
    model: 'coliseum_polis_v1';
}

export type ColiseumRankingModel = 'coliseum_polis_v1' | 'recency_only' | 'votes_only';

export interface ColiseumRankingWeights {
    votes: number;
    recency: number;
    citationDepth: number;
    stanceBalance: number;
    consensus: number;
    recencyHalfLifeHours: number;
}

export const DEFAULT_COLISEUM_WEIGHTS: ColiseumRankingWeights = {
    votes: 0.35,
    recency: 0.2,
    citationDepth: 0.15,
    stanceBalance: 0.1,
    consensus: 0.2,
    recencyHalfLifeHours: 8,
};

function clamp01(value: number): number {
    if (Number.isNaN(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

function recencyScore(createdAtIso: string, halfLifeHours: number, nowMs: number): number {
    const createdMs = Date.parse(createdAtIso);
    if (Number.isNaN(createdMs)) return 0;
    const ageHours = Math.max(0, (nowMs - createdMs) / 3_600_000);
    return Math.pow(0.5, ageHours / halfLifeHours);
}

/**
 * Stance-balance bonus rewards arguments that are not extreme. Pure 'nuance'
 * arguments get the full bonus; 'for'/'against' get a partial bonus scaled by
 * (1 - stanceWeight). This is what gives "room for nuance" in the rank.
 */
function stanceBalanceScore(stance: ColiseumStance, stanceWeight: number): number {
    const w = clamp01(stanceWeight);
    if (stance === 'nuance') return 1;
    return clamp01(1 - w);
}

export function scoreColiseumArgument(
    argument: ColiseumArgument,
    options: {
        model?: ColiseumRankingModel;
        weights?: Partial<ColiseumRankingWeights>;
        nowMs?: number;
    } = {}
): number {
    const model = options.model ?? 'coliseum_polis_v1';
    const weights = { ...DEFAULT_COLISEUM_WEIGHTS, ...options.weights };
    const nowMs = options.nowMs ?? Date.now();

    if (model === 'recency_only') {
        return recencyScore(argument.createdAt, weights.recencyHalfLifeHours, nowMs);
    }
    if (model === 'votes_only') {
        return clamp01(argument.voteScore);
    }

    const recency = recencyScore(argument.createdAt, weights.recencyHalfLifeHours, nowMs);
    const citation = citationDepthScore(argument.citations);
    const balance = stanceBalanceScore(argument.stance, argument.stanceWeight);

    return clamp01(
        weights.votes * clamp01(argument.voteScore) +
            weights.recency * recency +
            weights.citationDepth * citation +
            weights.stanceBalance * balance +
            weights.consensus * clamp01(argument.nuanceScore)
    );
}

export interface RankedColiseumArgument extends ColiseumArgument {
    score: number;
}

export function rankColiseumArguments(
    args: ReadonlyArray<ColiseumArgument>,
    options: Parameters<typeof scoreColiseumArgument>[1] = {}
): RankedColiseumArgument[] {
    return args
        .map((argument) => ({ ...argument, score: scoreColiseumArgument(argument, options) }))
        .sort((a, b) => b.score - a.score);
}

export interface ColiseumArgumentTreeNode<T extends ColiseumArgument = ColiseumArgument> {
    argument: T;
    depth: number;
    replies: ColiseumArgumentTreeNode<T>[];
}

/**
 * Fold a flat argument list into a rebuttal tree using `parentArgumentId`.
 * Input order is preserved at every level (so a pre-ranked list yields a
 * rank-ordered tree). Arguments whose parent is missing or points outside the
 * list are treated as roots, so the tree never drops an argument.
 */
export function buildColiseumArgumentTree<T extends ColiseumArgument>(
    args: ReadonlyArray<T>
): ColiseumArgumentTreeNode<T>[] {
    const nodes = new Map<string, ColiseumArgumentTreeNode<T>>();
    for (const argument of args) {
        nodes.set(argument.id, { argument, depth: 0, replies: [] });
    }

    const roots: ColiseumArgumentTreeNode<T>[] = [];
    for (const argument of args) {
        const node = nodes.get(argument.id)!;
        const parentId = argument.parentArgumentId;
        const parent = parentId ? nodes.get(parentId) : undefined;
        if (parent && parent.argument.id !== argument.id) {
            parent.replies.push(node);
        } else {
            roots.push(node);
        }
    }

    const assignDepth = (node: ColiseumArgumentTreeNode<T>, depth: number): void => {
        node.depth = depth;
        for (const reply of node.replies) assignDepth(reply, depth + 1);
    };
    for (const root of roots) assignDepth(root, 0);

    return roots;
}

export interface CrossTopicReelEntry<T extends ColiseumArgument = ColiseumArgument> {
    argument: T;
    /** The argument's topic debate heat, 0..1. */
    debateHeat: number;
}

export interface RankedCrossTopicArgument<T extends ColiseumArgument = ColiseumArgument>
    extends RankedColiseumArgument {
    argument: T;
}

/**
 * Rank arguments drawn from many topics for the global discourse reel. Each
 * argument's own score is multiplied by a heat factor so a hot topic's top
 * arguments float up without drowning a strong argument on a cooler topic.
 */
export function rankCrossTopicArguments<T extends ColiseumArgument>(
    entries: ReadonlyArray<CrossTopicReelEntry<T>>,
    options: Parameters<typeof scoreColiseumArgument>[1] = {}
): Array<T & { score: number }> {
    return entries
        .map(({ argument, debateHeat }) => {
            const base = scoreColiseumArgument(argument, options);
            const heatFactor = 0.7 + 0.3 * clamp01(debateHeat);
            return { ...argument, score: clamp01(base * heatFactor) };
        })
        .sort((a, b) => b.score - a.score);
}

/**
 * Compute the topic-level "debate heat" used to rank topics on the Topics tab.
 * Mirror of coalition's score() shape: blended weighted sum, clamp01.
 *
 * recency  → HN-style time decay on the news anchor's publishedAt
 * velocity → arguments+votes per hour over the topic's age, normalized
 */
export function computeTopicHeat(input: {
    publishedAt: string;
    createdAt: string;
    argumentCount: number;
    voteCount: number;
    nowMs?: number;
    recencyHalfLifeHours?: number;
    velocityNormalizationPerHour?: number;
}): { recencyScore: number; velocityScore: number; debateHeat: number } {
    const nowMs = input.nowMs ?? Date.now();
    const halfLife = input.recencyHalfLifeHours ?? 6;
    const norm = input.velocityNormalizationPerHour ?? 20;

    const recency = recencyScore(input.publishedAt, halfLife, nowMs);

    const createdMs = Date.parse(input.createdAt);
    const ageHours = Number.isNaN(createdMs) ? 0 : Math.max(0.25, (nowMs - createdMs) / 3_600_000);
    const interactions = input.argumentCount + input.voteCount;
    const velocity = clamp01(interactions / ageHours / norm);

    const heat = clamp01(0.55 * recency + 0.45 * velocity);
    return { recencyScore: clamp01(recency), velocityScore: velocity, debateHeat: heat };
}

export function normalizeColiseumTopic<
    T extends Omit<
        ColiseumTopic,
        'seed' | 'status' | 'recencyScore' | 'velocityScore' | 'debateHeat' | 'category'
    > & {
        seed?: ColiseumTopicSeed;
        status?: ColiseumTopicStatus;
        category?: string;
        argumentCount?: number;
        voteCount?: number;
    }
>(input: T, nowMs: number = Date.now()): ColiseumTopic {
    const timeline: ColiseumTopicTimeline = {
        createdAt: input.createdAt,
        closesAt: input.closesAt,
        archivesAt: input.archivesAt,
    };
    const status = input.status ?? deriveColiseumTopicStatus(timeline, nowMs);
    // Accepts either representation: a `seed`, or a legacy bare `newsAnchor`
    // from a pre-seed client or an un-migrated row.
    const seed = resolveTopicSeed(input);
    const heat = computeTopicHeat({
        // Only a link seed has an article publish date; everything else decays
        // from when it was proposed. Passing an absent date here would score
        // recency as 0 and quietly bury every non-link topic.
        publishedAt: seedPublishedAt(seed, input.createdAt),
        createdAt: input.createdAt,
        argumentCount: input.argumentCount ?? 0,
        voteCount: input.voteCount ?? 0,
        nowMs,
    });
    const category = normalizeColiseumCategoryKey(input.category) ?? undefined;
    const newsAnchor = seedToNewsAnchor(seed);

    return {
        id: input.id,
        title: input.title,
        seed,
        ...(newsAnchor ? { newsAnchor } : {}),
        ...(input.discussionDenId ? { discussionDenId: input.discussionDenId } : {}),
        createdAt: input.createdAt,
        closesAt: input.closesAt,
        archivesAt: input.archivesAt,
        tags: input.tags,
        category,
        canopyId: input.canopyId,
        denId: input.denId,
        status,
        recencyScore: heat.recencyScore,
        velocityScore: heat.velocityScore,
        debateHeat: heat.debateHeat,
    };
}

export function rankColiseumTopics(topics: ReadonlyArray<ColiseumTopic>): ColiseumTopic[] {
    return [...topics].sort((a, b) => b.debateHeat - a.debateHeat);
}

/**
 * Wilson lower bound on a binomial proportion at 95% confidence. Used for
 * `voteScore` so a 5/5 argument doesn't outrank a 200/210 argument purely on
 * ratio.
 */
export function wilsonLowerBound(up: number, down: number, z: number = 1.96): number {
    const n = up + down;
    if (n <= 0) return 0;
    const phat = up / n;
    const denom = 1 + (z * z) / n;
    const center = phat + (z * z) / (2 * n);
    const margin = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * n)) / n);
    return clamp01((center - margin) / denom);
}
