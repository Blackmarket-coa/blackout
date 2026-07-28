/**
 * The Coliseum knowledge repository — the read model that turns resolved
 * conflict into compounding value. Matches mint Briefs and topic debates
 * produce winner verdicts; both are folded into a single searchable,
 * domain-tagged {@link ColiseumKnowledgeEntry} archive so a settled question
 * keeps paying out long after the fight ends.
 *
 * Ranking here deliberately rewards insight and resolution quality —
 * steel-manning, sourcing, verdict confidence — never raw attention or watch
 * time. A lopsided pile-on with no evidence ranks below a well-sourced debate
 * that genuinely moved the crowd.
 */

import type { ColiseumBrief } from './brief';
import { citationDepthScore, type ColiseumCitation } from './citations';
import type { ColiseumWinnerVerdictResult } from './consensus';
import { wilsonLowerBound, type ColiseumArgument, type ColiseumTopic } from './feed';
import type { ColiseumTopicCategoryKey } from './taxonomy';

/**
 * Where a knowledge entry came from. `brief` = a 1v1 match's minted Brief;
 * `debate_verdict` = a resolved topic debate's winner verdict; `explainer` = a
 * standalone authored explanation, endorsed (or not) by the community.
 */
export type ColiseumKnowledgeKind = 'brief' | 'debate_verdict' | 'explainer';

export const COLISEUM_KNOWLEDGE_KINDS: readonly ColiseumKnowledgeKind[] = [
    'brief',
    'debate_verdict',
    'explainer',
] as const;

export function isColiseumKnowledgeKind(value: unknown): value is ColiseumKnowledgeKind {
    return (
        typeof value === 'string' && (COLISEUM_KNOWLEDGE_KINDS as readonly string[]).includes(value)
    );
}

export interface ColiseumKnowledgeEntry {
    /** Stable id, namespaced by kind: `brief:<briefId>` or `debate:<topicId>`. */
    id: string;
    kind: ColiseumKnowledgeKind;
    /** The resolved proposition or topic title. */
    title: string;
    domain?: ColiseumTopicCategoryKey;
    tags: string[];
    /** One-line outcome ("Red won 4–1", "Winner: <argument excerpt>"). */
    summary: string;
    /** Participants credited on the record (fighters or argument authors). */
    authorIds: string[];
    /** 0..1 — how decisively the question resolved. */
    verdictConfidence: number;
    /** 0..1 — evidence strength behind the resolution. */
    sourcingScore: number;
    /** 0..1 — genuine cross-camp engagement (steel-manning, moved minds). */
    steelmanScore: number;
    /** 0..1 — composite insight quality; the archive's ranking key. */
    insightScore: number;
    /** When the verdict dropped / the Brief was minted. */
    resolvedAt: string;
    /** The underlying matchId or topicId. */
    sourceId: string;
}

export interface KnowledgeInsightWeights {
    verdictConfidence: number;
    sourcing: number;
    steelman: number;
}

/**
 * Insight-quality weights. Confidence leads (an unresolved fight teaches
 * little), sourcing close behind, steel-manning rounds it out. There is no
 * recency, vote-volume, or watch-time term on purpose.
 */
export const DEFAULT_KNOWLEDGE_WEIGHTS: KnowledgeInsightWeights = {
    verdictConfidence: 0.45,
    sourcing: 0.35,
    steelman: 0.2,
};

function clamp01(value: number): number {
    if (Number.isNaN(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

export function computeInsightScore(
    components: {
        verdictConfidence: number;
        sourcingScore: number;
        steelmanScore: number;
    },
    weights: KnowledgeInsightWeights = DEFAULT_KNOWLEDGE_WEIGHTS
): number {
    return clamp01(
        weights.verdictConfidence * clamp01(components.verdictConfidence) +
            weights.sourcing * clamp01(components.sourcingScore) +
            weights.steelman * clamp01(components.steelmanScore)
    );
}

const EVIDENCE_RULING_SCORE: Record<string, number> = {
    holds: 1,
    stretches: 0.4,
    falls: 0,
};

export interface BriefKnowledgeInput {
    brief: ColiseumBrief;
    /** The domain the match was tagged with, when known. */
    domain?: ColiseumTopicCategoryKey;
    /** The fighters credited on the record (challenger + opponent). */
    authorIds?: string[];
}

/**
 * Fold a minted match Brief into a knowledge entry.
 *
 * confidence → mean winner-share across the Crucible's question breakdown,
 *              halved on a draw (a draw still resolves, just weakly)
 * sourcing   → mean evidence-ruling score over staked claims (holds=1,
 *              stretches=0.4, falls=0); 0 when nothing was staked
 * steelman   → blend of the "changed your mind" share and the Shift Score,
 *              the two signals that the fight actually engaged the other camp
 */
export function briefToKnowledgeEntry(input: BriefKnowledgeInput): ColiseumKnowledgeEntry {
    const { brief } = input;

    let winnerShareSum = 0;
    let questionCount = 0;
    let changedMindShare = 0;
    for (const question of brief.questionBreakdown) {
        const total = question.red + question.blue + question.neither + question.both;
        if (total <= 0) continue;
        const winnerVotes =
            question.winner === 'red'
                ? question.red
                : question.winner === 'blue'
                ? question.blue
                : Math.max(question.neither, question.both);
        winnerShareSum += winnerVotes / total;
        questionCount += 1;
        if (question.questionId === 'changed_mind') {
            // 'both'/'red'/'blue' all mean somebody moved somebody.
            changedMindShare = (total - question.neither) / total;
        }
    }
    const decisiveness = questionCount > 0 ? winnerShareSum / questionCount : 0;
    const verdictConfidence = clamp01(decisiveness * (brief.winner ? 1 : 0.5));

    const ruledClaims = brief.claims.filter((claim) => claim.evidenceRuling);
    const sourcingScore =
        ruledClaims.length === 0
            ? 0
            : clamp01(
                  ruledClaims.reduce(
                      (sum, claim) => sum + (EVIDENCE_RULING_SCORE[claim.evidenceRuling!] ?? 0),
                      0
                  ) / ruledClaims.length
              );

    const steelmanScore = clamp01(0.5 * changedMindShare + 0.5 * clamp01(brief.shiftScore));

    const summary =
        brief.winner === null
            ? 'Draw — the crowd split'
            : `${brief.winner === 'red' ? 'Challenger' : 'Opponent'} won`;

    const components = { verdictConfidence, sourcingScore, steelmanScore };
    return {
        id: `brief:${brief.id}`,
        kind: 'brief',
        title: brief.proposition,
        domain: input.domain,
        tags: [],
        summary,
        authorIds: input.authorIds ?? [],
        verdictConfidence,
        sourcingScore,
        steelmanScore,
        insightScore: computeInsightScore(components),
        resolvedAt: brief.mintedAt,
        sourceId: brief.matchId,
    };
}

export interface DebateVerdictKnowledgeInput {
    topic: ColiseumTopic;
    verdict: ColiseumWinnerVerdictResult;
    /** All arguments on the topic (used for sourcing + steel-man signals). */
    arguments: ReadonlyArray<ColiseumArgument>;
    /** Max characters of the winning argument quoted in the summary. */
    summaryExcerptChars?: number;
}

/**
 * Fold a resolved topic debate's winner verdict into a knowledge entry.
 * Returns null when the verdict has no winner (an empty debate resolves
 * nothing and would only pad the archive).
 *
 * confidence → winner's Wilson vote score blended with its cross-cluster
 *              consensus — a winner every camp endorses resolves decisively
 * sourcing   → citation depth of the winning argument
 * steelman   → share of rebuttals that cross stances (arguing with the other
 *              camp, not amplifying your own), plus the nuance share of the
 *              consensus set
 */
export function debateVerdictToKnowledgeEntry(
    input: DebateVerdictKnowledgeInput
): ColiseumKnowledgeEntry | null {
    const { topic, verdict } = input;
    const winnerId = verdict.winningArgumentId;
    if (!winnerId) return null;
    const byId = new Map(input.arguments.map((argument) => [argument.id, argument]));
    const winner = byId.get(winnerId);
    if (!winner) return null;

    const consensus = clamp01(verdict.consensusByArgument[winnerId] ?? 0);
    const verdictConfidence = clamp01(0.6 * clamp01(winner.voteScore) + 0.4 * consensus);

    const sourcingScore = citationDepthScore(winner.citations);

    let rebuttals = 0;
    let crossStanceRebuttals = 0;
    for (const argument of input.arguments) {
        const parent = argument.parentArgumentId ? byId.get(argument.parentArgumentId) : undefined;
        if (!parent) continue;
        rebuttals += 1;
        if (parent.stance !== argument.stance) crossStanceRebuttals += 1;
    }
    const crossStanceShare = rebuttals > 0 ? crossStanceRebuttals / rebuttals : 0;
    const nuanceShare =
        verdict.consensusArgumentIds.length > 0
            ? verdict.consensusArgumentIds.filter((id) => byId.get(id)?.stance === 'nuance')
                  .length / verdict.consensusArgumentIds.length
            : 0;
    const steelmanScore = clamp01(0.7 * crossStanceShare + 0.3 * nuanceShare);

    const excerptChars = input.summaryExcerptChars ?? 120;
    const body = winner.body.trim();
    const excerpt = body.length > excerptChars ? `${body.slice(0, excerptChars - 1)}…` : body;

    const components = { verdictConfidence, sourcingScore, steelmanScore };
    return {
        id: `debate:${topic.id}`,
        kind: 'debate_verdict',
        title: topic.title,
        domain: topic.category,
        tags: topic.tags,
        summary: `Winner: ${excerpt}`,
        authorIds: [...new Set([winner.authorId])],
        verdictConfidence,
        sourcingScore,
        steelmanScore,
        insightScore: computeInsightScore(components),
        resolvedAt: verdict.computedAt,
        sourceId: topic.id,
    };
}

export interface KnowledgeSearchFilter {
    /** Free text, AND-matched token-wise over title, summary, and tags. */
    query?: string;
    domain?: ColiseumTopicCategoryKey;
    kind?: ColiseumKnowledgeKind;
}

function entryHaystack(entry: ColiseumKnowledgeEntry): string {
    return `${entry.title} ${entry.summary} ${entry.tags.join(' ')}`.toLowerCase();
}

export function searchKnowledgeEntries(
    entries: ReadonlyArray<ColiseumKnowledgeEntry>,
    filter: KnowledgeSearchFilter = {}
): ColiseumKnowledgeEntry[] {
    const tokens = (filter.query ?? '')
        .toLowerCase()
        .split(/\s+/)
        .filter((token) => token.length > 0);
    return entries.filter((entry) => {
        if (filter.domain && entry.domain !== filter.domain) return false;
        if (filter.kind && entry.kind !== filter.kind) return false;
        if (tokens.length === 0) return true;
        const haystack = entryHaystack(entry);
        return tokens.every((token) => haystack.includes(token));
    });
}

/**
 * Rank the archive by insight quality, newest first among equals. This is the
 * whole point of the repository: what surfaces is what resolved well, not
 * what was watched most.
 */
export function rankKnowledgeEntries(
    entries: ReadonlyArray<ColiseumKnowledgeEntry>
): ColiseumKnowledgeEntry[] {
    return [...entries].sort(
        (a, b) => b.insightScore - a.insightScore || b.resolvedAt.localeCompare(a.resolvedAt)
    );
}

// --- Explainers (standalone authored knowledge) ---

export const EXPLAINER_TITLE_MAX_CHARS = 200;
export const EXPLAINER_BODY_MAX_CHARS = 12_000;
export const EXPLAINER_MAX_TAGS = 12;
export const EXPLAINER_MAX_COUNTERPOINTS = 8;

/**
 * A standalone authored explanation — knowledge that doesn't need a fight to
 * exist. Explainers carry citations (sourcing) and explicitly acknowledged
 * counterpoints (steel-manning), and the community endorses or disputes them
 * with helpful votes; all three feed the same insight ranking as verdicts.
 */
export interface ColiseumExplainer {
    id: string;
    authorId: string;
    title: string;
    body: string;
    domain?: ColiseumTopicCategoryKey;
    tags: string[];
    citations: ColiseumCitation[];
    /** Opposing arguments the author explicitly acknowledges and addresses. */
    counterpoints: string[];
    /** Community endorsement tallies ("was this explanation sound?"). */
    upVotes: number;
    downVotes: number;
    createdAt: string;
}

/** Counterpoints acknowledged before the steel-man signal saturates. */
const EXPLAINER_STEELMAN_SATURATION = 3;

/**
 * Fold an explainer into a knowledge entry.
 *
 * confidence → Wilson lower bound on helpful votes — how confidently the
 *              community endorses the explanation (0 until votes arrive)
 * sourcing   → citation depth, same measure arguments use
 * steelman   → share of the counterpoint saturation met: explicitly
 *              acknowledging opposing arguments is literal steel-manning
 */
export function explainerToKnowledgeEntry(explainer: ColiseumExplainer): ColiseumKnowledgeEntry {
    const verdictConfidence = wilsonLowerBound(explainer.upVotes, explainer.downVotes);
    const sourcingScore = citationDepthScore(explainer.citations);
    const steelmanScore = clamp01(explainer.counterpoints.length / EXPLAINER_STEELMAN_SATURATION);

    const body = explainer.body.trim();
    const summary = body.length > 140 ? `${body.slice(0, 139)}…` : body;

    const components = { verdictConfidence, sourcingScore, steelmanScore };
    return {
        id: `explainer:${explainer.id}`,
        kind: 'explainer',
        title: explainer.title,
        domain: explainer.domain,
        tags: explainer.tags,
        summary,
        authorIds: [explainer.authorId],
        verdictConfidence,
        sourcingScore,
        steelmanScore,
        insightScore: computeInsightScore(components),
        resolvedAt: explainer.createdAt,
        sourceId: explainer.id,
    };
}
