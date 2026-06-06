import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
    GLOBAL_SEARCH_TYPES,
    type GlobalSearchResult,
    type GlobalSearchType,
} from '@blackout/core';
import { globalSearch, globalTrending } from './globalSearchClient';

const TYPE_LABEL: Record<GlobalSearchType, string> = {
    coalition: 'Coalition',
    creator: 'Creator',
    bounty: 'Bounty',
    project: 'Project',
};

const panelStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    border: '1px solid var(--border-default, rgba(255,255,255,0.12))',
    background: 'var(--bg-surface, rgba(255,255,255,0.03))',
};

const inputStyle: CSSProperties = {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    border: '1px solid var(--border-default, rgba(255,255,255,0.12))',
    background: 'var(--bg-input, rgba(0,0,0,0.2))',
    color: 'var(--text-primary, #fff)',
};

const chipStyle = (active: boolean): CSSProperties => ({
    fontSize: 12,
    padding: '4px 10px',
    borderRadius: 999,
    cursor: 'pointer',
    border: `1px solid ${active ? 'var(--accent-primary, #1ABC9C)' : 'var(--border-default, rgba(255,255,255,0.12))'}`,
    background: active ? 'var(--accent-primary, #1ABC9C)' : 'transparent',
    color: active ? '#fff' : 'var(--text-secondary, #aaa)',
});

const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
    background: 'var(--bg-input, rgba(0,0,0,0.15))',
};

const badgeStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    padding: '2px 8px',
    borderRadius: 999,
    border: '1px solid var(--border-default, rgba(255,255,255,0.12))',
    color: 'var(--text-secondary, #aaa)',
};

function ResultRow({ result }: { result: GlobalSearchResult }) {
    return (
        <div style={rowStyle} data-testid="global-search-result" data-result-type={result.type}>
            <span style={badgeStyle}>{TYPE_LABEL[result.type]}</span>
            <span style={{ fontWeight: 600, flex: 1 }}>{result.title}</span>
            {result.subtitle ? (
                <span style={{ fontSize: 12, color: 'var(--text-secondary, #aaa)' }}>
                    {result.subtitle}
                </span>
            ) : null}
        </div>
    );
}

/**
 * Cross-entity global search + trending. Searches coalitions, creators,
 * bounties, and projects via `/v1/search`; with an empty query it shows the
 * cross-entity trending list. Self-contained so it can mount anywhere.
 */
export function GlobalSearchPanel(): JSX.Element {
    const [query, setQuery] = useState('');
    const [activeTypes, setActiveTypes] = useState<Set<GlobalSearchType>>(new Set());
    const [results, setResults] = useState<GlobalSearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [trendingMode, setTrendingMode] = useState(true);

    const toggleType = useCallback((type: GlobalSearchType) => {
        setActiveTypes((prev) => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
        });
    }, []);

    // Load trending on mount and whenever the query is cleared.
    useEffect(() => {
        if (query.trim().length > 0) return;
        let cancelled = false;
        setTrendingMode(true);
        setLoading(true);
        globalTrending()
            .then((res) => {
                if (!cancelled) setResults(res.results);
            })
            .catch(() => {
                if (!cancelled) setResults([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [query]);

    const runSearch = useCallback(() => {
        const trimmed = query.trim();
        if (trimmed.length === 0) return;
        setTrendingMode(false);
        setLoading(true);
        globalSearch(trimmed, [...activeTypes])
            .then((res) => setResults(res.results))
            .catch(() => setResults([]))
            .finally(() => setLoading(false));
    }, [query, activeTypes]);

    return (
        <section style={panelStyle} data-testid="global-search-panel">
            <div style={{ display: 'flex', gap: 8 }}>
                <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') runSearch();
                    }}
                    placeholder="Search coalitions, creators, bounties, projects…"
                    data-testid="global-search-input"
                    style={inputStyle}
                />
                <button
                    type="button"
                    onClick={runSearch}
                    disabled={query.trim().length === 0}
                    style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--accent-primary, #1ABC9C)',
                        background: 'var(--accent-primary, #1ABC9C)',
                        color: '#fff',
                        cursor: 'pointer',
                    }}
                >
                    Search
                </button>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {GLOBAL_SEARCH_TYPES.map((type) => (
                    <button
                        key={type}
                        type="button"
                        style={chipStyle(activeTypes.has(type))}
                        aria-pressed={activeTypes.has(type)}
                        onClick={() => toggleType(type)}
                    >
                        {TYPE_LABEL[type]}
                    </button>
                ))}
            </div>

            <span style={{ fontSize: 12, color: 'var(--text-secondary, #aaa)' }}>
                {trendingMode ? 'Trending across the ecosystem' : `Results for “${query.trim()}”`}
            </span>

            {loading ? (
                <span style={{ fontSize: 13, color: 'var(--text-secondary, #aaa)' }}>Loading…</span>
            ) : results.length === 0 ? (
                <span style={{ fontSize: 13, color: 'var(--text-secondary, #aaa)' }}>
                    Nothing to show yet.
                </span>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {results.map((result) => (
                        <ResultRow key={`${result.type}:${result.id}`} result={result} />
                    ))}
                </div>
            )}
        </section>
    );
}

export default GlobalSearchPanel;
