import React, { useEffect, useMemo, useState } from 'react';
import {
    COLISEUM_TOPIC_CATEGORIES,
    type ColiseumKnowledgeEntry,
    type ColiseumKnowledgeKind,
    type ColiseumTopicCategoryKey,
} from '@blackout/core';
import { EmptyState } from '@blackout/ui/primitives';
import { fetchColiseumKnowledge, voteColiseumExplainer } from '../coliseumClient';
import { ExplainerComposer } from '../components/ExplainerComposer';
import { RelativeTime } from '../components/RelativeTime';
import { cx } from '../components/cx';
import * as ui from '../components/coliseumUi.css';

type DomainFilter = ColiseumTopicCategoryKey | 'all';
type KindFilter = ColiseumKnowledgeKind | 'all';

const KIND_FILTERS: Array<{ key: KindFilter; label: string }> = [
    { key: 'all', label: 'Everything' },
    { key: 'brief', label: 'Match Briefs' },
    { key: 'debate_verdict', label: 'Debate verdicts' },
    { key: 'explainer', label: 'Explainers' },
];

const KIND_BADGE: Record<ColiseumKnowledgeKind, string> = {
    brief: '⚔️ Brief',
    debate_verdict: '🏛️ Verdict',
    explainer: '📖 Explainer',
};

const SEARCH_DEBOUNCE_MS = 250;

function percent(value: number): string {
    return `${Math.round(value * 100)}%`;
}

function KnowledgeCard({
    entry,
    onEndorse,
}: {
    entry: ColiseumKnowledgeEntry;
    /** Present only for explainer entries; casts a helpful vote. */
    onEndorse?: (explainerId: string) => void;
}) {
    const domainLabel = COLISEUM_TOPIC_CATEGORIES.find(
        (category) => category.key === entry.domain
    )?.label;
    return (
        <article className={ui.card} data-testid="coliseum-knowledge-entry">
            <div className={ui.cardHeaderRow}>
                <span className={ui.tagChip}>{KIND_BADGE[entry.kind]}</span>
                {domainLabel ? <span className={ui.tagChip}>{domainLabel}</span> : null}
                <span style={{ marginLeft: 'auto' }}>
                    <RelativeTime timestamp={entry.resolvedAt} />
                </span>
            </div>
            <h3 className={ui.cardTitle}>{entry.title}</h3>
            <p className={ui.mutedText} style={{ margin: 0 }}>
                {entry.summary}
            </p>
            {entry.kind === 'explainer' && onEndorse ? (
                <div className={ui.actionRow}>
                    <button
                        type="button"
                        className={ui.actionButton}
                        data-testid="knowledge-endorse-button"
                        title="Endorse this explanation as sound"
                        onClick={() => onEndorse(entry.sourceId)}
                    >
                        ▲ Helpful
                    </button>
                </div>
            ) : null}
            <div className={ui.tagRow}>
                <span className={ui.tagChip} title="How decisively this resolved">
                    Confidence {percent(entry.verdictConfidence)}
                </span>
                <span className={ui.tagChip} title="Evidence strength behind the resolution">
                    Sourcing {percent(entry.sourcingScore)}
                </span>
                <span className={ui.tagChip} title="Genuine cross-camp engagement">
                    Steel-man {percent(entry.steelmanScore)}
                </span>
                {entry.tags.slice(0, 4).map((tag) => (
                    <span key={tag} className={ui.tagChip}>
                        #{tag}
                    </span>
                ))}
            </div>
        </article>
    );
}

function CardSkeleton() {
    return <div className={ui.skeleton} style={{ height: 120 }} aria-hidden />;
}

/**
 * The Knowledge tab — Coliseum's compounding archive. Every minted match Brief
 * and resolved topic debate lands here, searchable and domain-tagged, ranked
 * by insight quality rather than attention.
 */
export function KnowledgeTab() {
    const [query, setQuery] = useState('');
    const [domain, setDomain] = useState<DomainFilter>('all');
    const [kind, setKind] = useState<KindFilter>('all');
    const [entries, setEntries] = useState<ColiseumKnowledgeEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [composing, setComposing] = useState(false);
    // Bumped after a publish or endorsement to refetch the ranked list.
    const [refreshKey, setRefreshKey] = useState(0);

    const [debouncedQuery, setDebouncedQuery] = useState('');
    useEffect(() => {
        const handle = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(handle);
    }, [query]);

    useEffect(() => {
        let active = true;
        setLoading(true);
        fetchColiseumKnowledge({
            query: debouncedQuery || undefined,
            domain: domain === 'all' ? undefined : domain,
            kind: kind === 'all' ? undefined : kind,
        })
            .then((response) => {
                if (active) setEntries(response.entries);
            })
            .catch(() => {
                if (active) setEntries([]);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [debouncedQuery, domain, kind, refreshKey]);

    const handleEndorse = (explainerId: string) => {
        voteColiseumExplainer(explainerId, 'up')
            .then(() => setRefreshKey((key) => key + 1))
            .catch(() => undefined);
    };

    const hasFilters = useMemo(
        () => debouncedQuery.length > 0 || domain !== 'all' || kind !== 'all',
        [debouncedQuery, domain, kind]
    );

    return (
        <div data-testid="coliseum-knowledge" style={{ minHeight: '100%' }}>
            <div className={ui.toolbarRow}>
                <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search settled debates…"
                    aria-label="Search the knowledge archive"
                    data-testid="coliseum-knowledge-search"
                    style={{
                        flex: 1,
                        minWidth: 0,
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        fontSize: 14,
                    }}
                />
                <button
                    type="button"
                    className={cx(composing ? ui.chipActive : ui.chip)}
                    aria-expanded={composing}
                    data-testid="knowledge-compose-toggle"
                    onClick={() => setComposing((open) => !open)}
                >
                    ✍️ Write an explainer
                </button>
            </div>
            {composing ? (
                <ExplainerComposer
                    onPublished={() => {
                        setComposing(false);
                        setKind('explainer');
                        setRefreshKey((key) => key + 1);
                    }}
                    onCancel={() => setComposing(false)}
                />
            ) : null}
            <div className={ui.chipRow} role="group" aria-label="Knowledge kind">
                {KIND_FILTERS.map((filter) => (
                    <button
                        key={filter.key}
                        type="button"
                        className={cx(kind === filter.key ? ui.chipActive : ui.chip)}
                        aria-pressed={kind === filter.key}
                        onClick={() => setKind(filter.key)}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>
            <div className={ui.chipRow} role="group" aria-label="Knowledge domain">
                <button
                    type="button"
                    className={cx(domain === 'all' ? ui.chipActive : ui.chip)}
                    aria-pressed={domain === 'all'}
                    onClick={() => setDomain('all')}
                >
                    All domains
                </button>
                {COLISEUM_TOPIC_CATEGORIES.map((category) => (
                    <button
                        key={category.key}
                        type="button"
                        className={cx(domain === category.key ? ui.chipActive : ui.chip)}
                        aria-pressed={domain === category.key}
                        onClick={() => setDomain(category.key)}
                    >
                        {category.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className={ui.feedColumn} aria-busy="true">
                    <CardSkeleton />
                    <CardSkeleton />
                    <CardSkeleton />
                </div>
            ) : entries.length === 0 ? (
                <EmptyState
                    title={hasFilters ? 'Nothing settled matches that' : 'Nothing settled yet'}
                    description={
                        hasFilters
                            ? 'Try a different search, domain, or kind — only resolved matches and debates live here.'
                            : 'When a match mints its Brief, a debate closes with a verdict, or someone publishes an explainer, it lands here permanently.'
                    }
                />
            ) : (
                <div className={ui.feedColumn}>
                    {entries.map((entry) => (
                        <KnowledgeCard key={entry.id} entry={entry} onEndorse={handleEndorse} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default KnowledgeTab;
