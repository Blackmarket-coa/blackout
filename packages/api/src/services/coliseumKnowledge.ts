/**
 * Read path for the Coliseum knowledge repository: the unified, searchable,
 * domain-tagged archive of resolved conflict. Match Briefs and resolved topic
 * debates are folded into one `ColiseumKnowledgeEntry` stream, ranked by
 * insight quality (verdict confidence, sourcing, steel-manning) — never by
 * watch time.
 */

import {
    briefToKnowledgeEntry,
    debateVerdictToKnowledgeEntry,
    explainerToKnowledgeEntry,
    rankKnowledgeEntries,
    searchKnowledgeEntries,
    validateCitations,
    type ColiseumExplainer,
    type ColiseumKnowledgeEntry,
    type ColiseumTopicCategoryKey,
    type ColiseumTopicStatus,
    type KnowledgeSearchFilter,
} from '@blackout/core';
import { db } from '../db/store';
import { listBriefEntries } from './coliseumMatchStore';
import { getVerdict, listArgumentsForTopic, listTopics } from './coliseumStore';

/**
 * Voting freezes at `closing` and the topic goes read-only at `archived` —
 * either way the debate has resolved and its verdict is stable enough to
 * archive as knowledge.
 */
const RESOLVED_TOPIC_STATUSES: readonly ColiseumTopicStatus[] = ['closing', 'archived'];

function briefKnowledgeEntries(): ColiseumKnowledgeEntry[] {
    return listBriefEntries().map(({ brief, domain }) => {
        const match = db.getColiseumMatch(brief.matchId);
        return briefToKnowledgeEntry({
            brief,
            domain,
            authorIds: match
                ? [match.challengerId, match.opponentId].filter(
                      (id): id is string => typeof id === 'string' && id.length > 0
                  )
                : [],
        });
    });
}

function debateKnowledgeEntries(nowMs: number): ColiseumKnowledgeEntry[] {
    const entries: ColiseumKnowledgeEntry[] = [];
    for (const status of RESOLVED_TOPIC_STATUSES) {
        for (const topic of listTopics({ status })) {
            const verdict = getVerdict(topic.id, nowMs);
            if (!verdict) continue;
            const entry = debateVerdictToKnowledgeEntry({
                topic,
                verdict,
                arguments: listArgumentsForTopic(topic.id, { nowMs }),
            });
            if (entry) entries.push(entry);
        }
    }
    return entries;
}

export interface KnowledgeListOptions extends KnowledgeSearchFilter {
    limit?: number;
    nowMs?: number;
}

export function listKnowledgeEntries(options: KnowledgeListOptions = {}): ColiseumKnowledgeEntry[] {
    const nowMs = options.nowMs ?? Date.now();
    const all = [
        ...briefKnowledgeEntries(),
        ...debateKnowledgeEntries(nowMs),
        ...db.listColiseumExplainers().map(explainerToKnowledgeEntry),
    ];
    const filtered = searchKnowledgeEntries(all, {
        query: options.query,
        domain: options.domain,
        kind: options.kind,
    });
    const ranked = rankKnowledgeEntries(filtered);
    return options.limit !== undefined ? ranked.slice(0, options.limit) : ranked;
}

// --- Explainers (standalone authored knowledge) ---

function newExplainerId(): string {
    return `exp_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export interface CreateExplainerInput {
    authorId: string;
    title: string;
    body: string;
    domain?: ColiseumTopicCategoryKey;
    tags?: string[];
    /** Loose citation payloads; invalid entries are silently dropped. */
    citations?: unknown[];
    counterpoints?: string[];
}

export function createExplainer(
    input: CreateExplainerInput,
    nowMs: number = Date.now()
): ColiseumExplainer {
    const explainer: ColiseumExplainer = {
        id: newExplainerId(),
        authorId: input.authorId,
        title: input.title.trim(),
        body: input.body.trim(),
        domain: input.domain,
        tags: [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))],
        citations: validateCitations(input.citations ?? []),
        counterpoints: (input.counterpoints ?? []).map((point) => point.trim()).filter(Boolean),
        upVotes: 0,
        downVotes: 0,
        createdAt: new Date(nowMs).toISOString(),
    };
    db.upsertColiseumExplainer(explainer);
    return explainer;
}

export function getExplainer(id: string): ColiseumExplainer | null {
    return db.getColiseumExplainer(id) ?? null;
}

/**
 * Cast (or flip) a helpful/unhelpful vote and recompute the explainer's
 * denormalized tallies from the vote rows — one vote per (explainer, voter).
 * Returns null when the explainer does not exist.
 */
export function voteExplainer(
    input: { explainerId: string; voterId: string; direction: 'up' | 'down' },
    nowMs: number = Date.now()
): ColiseumExplainer | null {
    const explainer = db.getColiseumExplainer(input.explainerId);
    if (!explainer) return null;
    db.upsertColiseumExplainerVote({
        explainerId: input.explainerId,
        voterId: input.voterId,
        direction: input.direction,
        createdAt: new Date(nowMs).toISOString(),
    });
    const votes = db
        .listColiseumExplainerVotes()
        .filter((vote) => vote.explainerId === input.explainerId);
    const upVotes = votes.filter((vote) => vote.direction === 'up').length;
    const downVotes = votes.length - upVotes;
    return db.upsertColiseumExplainer({ ...explainer, upVotes, downVotes });
}
