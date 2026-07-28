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
    rankKnowledgeEntries,
    searchKnowledgeEntries,
    type ColiseumKnowledgeEntry,
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
    const all = [...briefKnowledgeEntries(), ...debateKnowledgeEntries(nowMs)];
    const filtered = searchKnowledgeEntries(all, {
        query: options.query,
        domain: options.domain,
        kind: options.kind,
    });
    const ranked = rankKnowledgeEntries(filtered);
    return options.limit !== undefined ? ranked.slice(0, options.limit) : ranked;
}
