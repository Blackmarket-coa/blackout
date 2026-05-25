import {
    DEFAULT_COLISEUM_WEIGHTS,
    computeTopicHeat,
    deriveColiseumTopicStatus,
    deriveColiseumWinnerVerdict,
    normalizeColiseumTopic,
    rankColiseumArguments,
    rankColiseumTopics,
    scoreColiseumArgument,
    wilsonLowerBound,
    type ColiseumArgument,
    type ColiseumArgumentMedia,
    type ColiseumCitation,
    type ColiseumNewsAnchor,
    type ColiseumStance,
    type ColiseumTopic,
    type ColiseumTopicCategoryKey,
    type ColiseumTopicStatus,
    type ColiseumVote,
    type ColiseumWinnerVerdictResult,
    type RankedColiseumArgument,
} from '@blackout/core';
import { recordReputationEvent } from './reputationStore';

const NOW_ISO = () => new Date().toISOString();

/**
 * An up-vote endorses the argument's author. Reputation is credited in the
 * topic's subject area, at most once per (voter, argument) so flipping a vote
 * never inflates the author's standing.
 */
function awardEndorsement(argumentId: string, voterId: string): void {
    const argument = argumentStore.get(argumentId);
    if (!argument || argument.authorId === voterId) return;
    const topic = topicStore.get(argument.topicId);
    recordReputationEvent({
        userId: argument.authorId,
        type: 'argument_endorsed',
        subject: topic?.category,
        dedupeKey: `endorse:${voterId}:${argumentId}`,
    });
}

interface TopicSeed {
    id: string;
    title: string;
    newsAnchor: ColiseumNewsAnchor;
    createdAt: string;
    closesAt?: string;
    archivesAt?: string;
    tags: string[];
    category?: ColiseumTopicCategoryKey;
    canopyId?: string;
    denId?: string;
}

const seedTopics: TopicSeed[] = [
    {
        id: 'topic-grid-resilience',
        title: 'Mutual aid microgrids vs. utility relief',
        newsAnchor: {
            sourceUrl: 'https://news.example/grid-resilience',
            headline: 'Storms knock out power for 200k; co-ops claim faster restore',
            publishedAt: '2026-05-02T08:30:00Z',
        },
        createdAt: '2026-05-02T09:00:00Z',
        tags: ['energy', 'infrastructure', 'mutual-aid'],
        category: 'politics',
        canopyId: 'demo-canopy',
    },
    {
        id: 'topic-ai-licensing',
        title: 'Should training-data provenance be a license requirement?',
        newsAnchor: {
            sourceUrl: 'https://news.example/ai-licensing',
            headline: 'EU draft floats provenance disclosure for foundation models',
            publishedAt: '2026-05-01T16:15:00Z',
        },
        createdAt: '2026-05-01T18:00:00Z',
        tags: ['ai', 'policy', 'open-source'],
        category: 'tech',
    },
    {
        id: 'topic-rent-control',
        title: 'Citywide rent stabilization: stop-gap or distortion?',
        newsAnchor: {
            sourceUrl: 'https://news.example/rent-control',
            headline: 'Council passes 2-year freeze amid affordability crisis',
            publishedAt: '2026-04-30T22:45:00Z',
        },
        createdAt: '2026-05-01T03:00:00Z',
        tags: ['housing', 'local'],
        category: 'local',
        denId: '!demo-housing:server',
    },
];

interface ArgumentSeed extends Omit<ColiseumArgument, 'voteScore' | 'nuanceScore'> {}

const seedArguments: ArgumentSeed[] = [
    {
        id: 'arg-grid-1',
        topicId: 'topic-grid-resilience',
        authorId: '@vine:server',
        stance: 'for',
        stanceWeight: 0.85,
        body: 'Co-ops restored 60% of affected feeders in <8h vs. utility median of 36h.',
        citations: [
            { kind: 'article', sourceUrl: 'https://news.example/grid-resilience', title: 'Storms knock out power for 200k' },
            { kind: 'townhall', meetingId: 'meeting-grid-debrief' },
        ],
        createdAt: '2026-05-02T10:00:00Z',
    },
    {
        id: 'arg-grid-2',
        topicId: 'topic-grid-resilience',
        authorId: '@oak:server',
        stance: 'against',
        stanceWeight: 0.7,
        body: 'Microgrids cherry-pick easy feeders; utilities own backbone substations.',
        citations: [{ kind: 'article', sourceUrl: 'https://news.example/grid-baseline', title: 'Substation responsibilities matter' }],
        createdAt: '2026-05-02T10:25:00Z',
    },
    {
        id: 'arg-grid-3',
        topicId: 'topic-grid-resilience',
        authorId: '@river:server',
        stance: 'nuance',
        stanceWeight: 0,
        body: 'Both/and: co-ops do last-mile fast; utilities hold the spine. Compensate the seam.',
        citations: [{ kind: 'live', roomId: '!grid-debate:server' }],
        createdAt: '2026-05-02T11:00:00Z',
    },
    {
        id: 'arg-ai-1',
        topicId: 'topic-ai-licensing',
        authorId: '@scribe:server',
        stance: 'for',
        stanceWeight: 0.9,
        body: 'No provenance ⇒ no audit trail. Audits are how we keep models honest.',
        citations: [
            { kind: 'article', sourceUrl: 'https://news.example/ai-licensing', title: 'EU draft floats provenance' },
        ],
        createdAt: '2026-05-01T19:00:00Z',
    },
    {
        id: 'arg-ai-2',
        topicId: 'topic-ai-licensing',
        authorId: '@delta:server',
        stance: 'nuance',
        stanceWeight: 0.2,
        body: 'Disclose at training time, not at inference. Anything else is performative.',
        citations: [],
        createdAt: '2026-05-01T19:45:00Z',
    },
];

const seedVotes: ColiseumVote[] = [
    { argumentId: 'arg-grid-1', voterId: '@u1:server', direction: 'up', createdAt: '2026-05-02T10:10:00Z' },
    { argumentId: 'arg-grid-1', voterId: '@u2:server', direction: 'up', createdAt: '2026-05-02T10:11:00Z' },
    { argumentId: 'arg-grid-1', voterId: '@u3:server', direction: 'up', createdAt: '2026-05-02T10:12:00Z' },
    { argumentId: 'arg-grid-1', voterId: '@u4:server', direction: 'down', createdAt: '2026-05-02T10:13:00Z' },
    { argumentId: 'arg-grid-2', voterId: '@u1:server', direction: 'down', createdAt: '2026-05-02T10:30:00Z' },
    { argumentId: 'arg-grid-2', voterId: '@u4:server', direction: 'up', createdAt: '2026-05-02T10:31:00Z' },
    { argumentId: 'arg-grid-2', voterId: '@u5:server', direction: 'up', createdAt: '2026-05-02T10:32:00Z' },
    { argumentId: 'arg-grid-3', voterId: '@u1:server', direction: 'up', createdAt: '2026-05-02T11:10:00Z' },
    { argumentId: 'arg-grid-3', voterId: '@u2:server', direction: 'up', createdAt: '2026-05-02T11:11:00Z' },
    { argumentId: 'arg-grid-3', voterId: '@u3:server', direction: 'up', createdAt: '2026-05-02T11:12:00Z' },
    { argumentId: 'arg-grid-3', voterId: '@u4:server', direction: 'up', createdAt: '2026-05-02T11:13:00Z' },
    { argumentId: 'arg-grid-3', voterId: '@u5:server', direction: 'up', createdAt: '2026-05-02T11:14:00Z' },
    { argumentId: 'arg-ai-1', voterId: '@u1:server', direction: 'up', createdAt: '2026-05-01T19:30:00Z' },
    { argumentId: 'arg-ai-1', voterId: '@u2:server', direction: 'up', createdAt: '2026-05-01T19:35:00Z' },
    { argumentId: 'arg-ai-2', voterId: '@u1:server', direction: 'up', createdAt: '2026-05-01T20:00:00Z' },
];

const topicStore = new Map<string, ColiseumTopic>();
const argumentStore = new Map<string, ColiseumArgument>();
const voteStore = new Map<string, ColiseumVote>();
/** keyed by `${argumentId}::${voterId}` to enforce one vote per (argument, voter). */
const voteIndex = new Map<string, ColiseumVote>();

function voteKey(argumentId: string, voterId: string): string {
    return `${argumentId}::${voterId}`;
}

function countVotesByArgument(): Map<string, { up: number; down: number }> {
    const counts = new Map<string, { up: number; down: number }>();
    for (const vote of voteStore.values()) {
        const entry = counts.get(vote.argumentId) ?? { up: 0, down: 0 };
        if (vote.direction === 'up') entry.up += 1;
        else entry.down += 1;
        counts.set(vote.argumentId, entry);
    }
    return counts;
}

function recomputeArgumentScores(topicId: string, nowMs: number = Date.now()): void {
    const topicArgs = [...argumentStore.values()].filter((a) => a.topicId === topicId);
    if (topicArgs.length === 0) return;
    const counts = countVotesByArgument();

    const verdict = deriveColiseumWinnerVerdict({
        topicId,
        arguments: topicArgs,
        votes: [...voteStore.values()].filter((v) =>
            topicArgs.some((a) => a.id === v.argumentId),
        ),
        nowMs,
    });

    for (const arg of topicArgs) {
        const c = counts.get(arg.id) ?? { up: 0, down: 0 };
        const voteScore = wilsonLowerBound(c.up, c.down);
        const nuanceScore = verdict.consensusByArgument[arg.id] ?? 0;
        argumentStore.set(arg.id, { ...arg, voteScore, nuanceScore });
    }
}

function recomputeTopicHeat(topicId: string, nowMs: number = Date.now()): void {
    const topic = topicStore.get(topicId);
    if (!topic) return;

    const topicArgs = [...argumentStore.values()].filter((a) => a.topicId === topicId);
    const argumentCount = topicArgs.length;
    let voteCount = 0;
    for (const vote of voteStore.values()) {
        if (topicArgs.some((a) => a.id === vote.argumentId)) voteCount += 1;
    }

    const heat = computeTopicHeat({
        publishedAt: topic.newsAnchor.publishedAt,
        createdAt: topic.createdAt,
        argumentCount,
        voteCount,
        nowMs,
    });
    const status = deriveColiseumTopicStatus(
        { createdAt: topic.createdAt, closesAt: topic.closesAt, archivesAt: topic.archivesAt },
        nowMs,
    );
    topicStore.set(topicId, {
        ...topic,
        recencyScore: heat.recencyScore,
        velocityScore: heat.velocityScore,
        debateHeat: heat.debateHeat,
        status,
    });
}

function seedAll(): void {
    const seedNow = Date.parse('2026-05-02T12:00:00Z');
    for (const seed of seedTopics) {
        const topic = normalizeColiseumTopic(
            { ...seed, argumentCount: 0, voteCount: 0 },
            seedNow,
        );
        topicStore.set(topic.id, topic);
    }
    for (const seed of seedArguments) {
        argumentStore.set(seed.id, { ...seed, voteScore: 0, nuanceScore: 0 });
    }
    for (const vote of seedVotes) {
        voteStore.set(`${vote.argumentId}::${vote.voterId}::${vote.createdAt}`, vote);
        voteIndex.set(voteKey(vote.argumentId, vote.voterId), vote);
        if (vote.direction === 'up') {
            awardEndorsement(vote.argumentId, vote.voterId);
        }
    }
    const topicIds = new Set([...argumentStore.values()].map((a) => a.topicId));
    for (const topicId of topicIds) {
        recomputeArgumentScores(topicId, seedNow);
        recomputeTopicHeat(topicId, seedNow);
    }
}

seedAll();

export interface TopicFilter {
    canopyId?: string;
    denId?: string;
    category?: ColiseumTopicCategoryKey;
    tag?: string;
    status?: ColiseumTopicStatus;
}

export function listTopics(filter: TopicFilter = {}): ColiseumTopic[] {
    const all = [...topicStore.values()];
    const filtered = all.filter((topic) => {
        if (filter.canopyId && topic.canopyId !== filter.canopyId) return false;
        if (filter.denId && topic.denId !== filter.denId) return false;
        if (filter.category && topic.category !== filter.category) return false;
        if (filter.tag && !topic.tags.includes(filter.tag)) return false;
        if (filter.status && topic.status !== filter.status) return false;
        return true;
    });
    return rankColiseumTopics(filtered);
}

export function getTopic(topicId: string): ColiseumTopic | null {
    return topicStore.get(topicId) ?? null;
}

export interface CreateTopicInput {
    id: string;
    title: string;
    newsAnchor: ColiseumNewsAnchor;
    tags: string[];
    category?: ColiseumTopicCategoryKey;
    canopyId?: string;
    denId?: string;
    closesAt?: string;
    archivesAt?: string;
}

export function createTopic(input: CreateTopicInput, nowMs: number = Date.now()): ColiseumTopic {
    const topic = normalizeColiseumTopic(
        {
            ...input,
            createdAt: new Date(nowMs).toISOString(),
            argumentCount: 0,
            voteCount: 0,
        },
        nowMs,
    );
    topicStore.set(topic.id, topic);
    return topic;
}

export function listArgumentsForTopic(
    topicId: string,
    options: { nowMs?: number } = {},
): RankedColiseumArgument[] {
    const args = [...argumentStore.values()].filter((a) => a.topicId === topicId);
    return rankColiseumArguments(args, { nowMs: options.nowMs });
}

export function scoreArgument(arg: ColiseumArgument, nowMs?: number): number {
    return scoreColiseumArgument(arg, { nowMs, weights: DEFAULT_COLISEUM_WEIGHTS });
}

export interface CreateArgumentInput {
    id: string;
    topicId: string;
    authorId: string;
    stance: ColiseumStance;
    stanceWeight: number;
    body: string;
    citations: ColiseumCitation[];
    media?: ColiseumArgumentMedia;
}

export function createArgument(
    input: CreateArgumentInput,
    nowMs: number = Date.now(),
): ColiseumArgument | null {
    if (!topicStore.has(input.topicId)) return null;
    const argument: ColiseumArgument = {
        ...input,
        createdAt: new Date(nowMs).toISOString(),
        voteScore: 0,
        nuanceScore: 0,
    };
    argumentStore.set(argument.id, argument);
    recomputeArgumentScores(input.topicId, nowMs);
    recomputeTopicHeat(input.topicId, nowMs);
    return argumentStore.get(argument.id) ?? null;
}

export function getArgument(argumentId: string): ColiseumArgument | null {
    return argumentStore.get(argumentId) ?? null;
}

export interface CastVoteInput {
    argumentId: string;
    voterId: string;
    direction: 'up' | 'down';
    stanceShift?: number;
}

export interface CastVoteResult {
    vote: ColiseumVote;
    argument: ColiseumArgument;
}

export function castVote(input: CastVoteInput, nowMs: number = Date.now()): CastVoteResult | null {
    const argument = argumentStore.get(input.argumentId);
    if (!argument) return null;
    const vote: ColiseumVote = {
        argumentId: input.argumentId,
        voterId: input.voterId,
        direction: input.direction,
        stanceShift: input.stanceShift,
        createdAt: new Date(nowMs).toISOString(),
    };
    const indexKey = voteKey(vote.argumentId, vote.voterId);
    const previous = voteIndex.get(indexKey);
    if (previous) {
        for (const [storedKey, storedVote] of voteStore) {
            if (
                storedVote.argumentId === previous.argumentId &&
                storedVote.voterId === previous.voterId &&
                storedVote.createdAt === previous.createdAt
            ) {
                voteStore.delete(storedKey);
                break;
            }
        }
    }
    const storeKey = `${vote.argumentId}::${vote.voterId}::${vote.createdAt}`;
    voteStore.set(storeKey, vote);
    voteIndex.set(indexKey, vote);
    recomputeArgumentScores(argument.topicId, nowMs);
    recomputeTopicHeat(argument.topicId, nowMs);
    if (vote.direction === 'up') {
        awardEndorsement(vote.argumentId, vote.voterId);
    }
    const updated = argumentStore.get(argument.id);
    if (!updated) return null;
    return { vote, argument: updated };
}

export function listVotesForArgument(argumentId: string): ColiseumVote[] {
    return [...voteStore.values()].filter((v) => v.argumentId === argumentId);
}

export function getVerdict(topicId: string, nowMs: number = Date.now()): ColiseumWinnerVerdictResult | null {
    if (!topicStore.has(topicId)) return null;
    const topicArgs = [...argumentStore.values()].filter((a) => a.topicId === topicId);
    const topicVotes = [...voteStore.values()].filter((v) =>
        topicArgs.some((a) => a.id === v.argumentId),
    );
    return deriveColiseumWinnerVerdict({
        topicId,
        arguments: topicArgs,
        votes: topicVotes,
        nowMs,
    });
}

export function newTopicId(): string {
    return `topic_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function newArgumentId(): string {
    return `arg_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function nowIso(): string {
    return NOW_ISO();
}
