import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { LIVE_PATH } from '../../pages/paths';
import {
    fetchStreamCategories,
    listStreams,
    type StreamCategory,
    type StreamSort,
    type StreamSummary,
} from './streamsClient';

const layoutStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    width: '100%',
    background: 'var(--bg-surface, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
};

const headerStyle: CSSProperties = {
    padding: '16px 20px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
};

const titleStyle: CSSProperties = { margin: 0, fontSize: 22, fontWeight: 700 };
const subtitleStyle: CSSProperties = {
    margin: 0,
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 13,
};

const sectionStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 10,
    padding: '12px 16px 24px',
};

const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 12,
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 12,
    background: 'var(--bg-input, #0f172a)',
    color: 'inherit',
    textDecoration: 'none',
};

const liveBadge: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 999,
    background: 'var(--text-danger, #ef4444)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 11,
    fontWeight: 700,
    width: 'fit-content',
};

const offlineBadge: CSSProperties = {
    ...liveBadge,
    background: 'var(--bg-nav, #1f2937)',
    color: 'var(--text-muted, #9ca3af)',
    border: '1px solid var(--border-default, #374151)',
};

const emptyStyle: CSSProperties = {
    margin: '24px 16px',
    padding: '24px 20px',
    border: '1px dashed var(--border-default, #374151)',
    borderRadius: 12,
    color: 'var(--text-muted, #9ca3af)',
    textAlign: 'center',
};

const controlsStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    padding: '4px 16px 8px',
};

const inputStyle: CSSProperties = {
    flex: '1 1 200px',
    minWidth: 160,
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-input, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 13,
};

const selectStyle: CSSProperties = {
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-input, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 13,
};

const chipRowStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    padding: '0 16px 8px',
};

const chip = (active: boolean): CSSProperties => ({
    padding: '4px 10px',
    borderRadius: 999,
    border: `1px solid ${active ? 'var(--accent-primary, #1ABC9C)' : 'var(--border-default, #374151)'}`,
    background: active ? 'var(--accent-primary, #1ABC9C)' : 'transparent',
    color: active ? '#04121d' : 'var(--text-muted, #9ca3af)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
});

const StreamCard = ({ stream }: { stream: StreamSummary }): JSX.Element => (
    <Link
        to={`${LIVE_PATH}/${encodeURIComponent(stream.id)}`}
        style={cardStyle}
        data-testid="live-directory-card"
        data-stream-id={stream.id}
        data-stream-state={stream.state}
    >
        <span style={stream.state === 'live' ? liveBadge : offlineBadge}>
            {stream.state === 'live' ? '● LIVE' : 'replay'}
        </span>
        <strong style={{ fontSize: 14 }}>{stream.title}</strong>
        <span style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)' }}>
            {stream.creatorId}
        </span>
        {stream.tags.length > 0 ? (
            <span style={{ fontSize: 11, color: 'var(--text-muted, #9ca3af)' }}>
                {stream.tags.map((tag) => `#${tag}`).join(' · ')}
            </span>
        ) : null}
    </Link>
);

/**
 * Live + recent-replays directory and browse surface mounted at `/live`.
 * Reads `streamsClient.listStreams()` with category/search/sort filters and
 * `fetchStreamCategories()` for the category chips. Live-first by default.
 * Empty state copy reflects that the catalog may simply be cold (no creators
 * have gone live yet) or that the active filters matched nothing.
 */
export const LiveDirectory = (): JSX.Element => {
    const [streams, setStreams] = useState<StreamSummary[]>([]);
    const [categories, setCategories] = useState<StreamCategory[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [forbidden, setForbidden] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const [search, setSearch] = useState('');
    const [category, setCategory] = useState<string | null>(null);
    const [sort, setSort] = useState<StreamSort>('live');

    // Categories are filter-independent; fetch once. A failure here is
    // non-fatal — the chips just don't render.
    useEffect(() => {
        let cancelled = false;
        fetchStreamCategories()
            .then((res) => {
                if (!cancelled) setCategories(res.categories);
            })
            .catch(() => {
                /* non-fatal: no category chips */
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoaded(false);
        const run = () => {
            listStreams({
                limit: 60,
                sort,
                category: category ?? undefined,
                search: search.trim() || undefined,
            })
                .then((response) => {
                    if (cancelled) return;
                    setStreams(response.items);
                    setError(null);
                    setForbidden(false);
                    setLoaded(true);
                })
                .catch((err) => {
                    if (cancelled) return;
                    if ((err as { status?: number } | null)?.status === 403) {
                        setForbidden(true);
                    } else {
                        setError(err instanceof Error ? err.message : 'failed to load streams');
                    }
                    setLoaded(true);
                });
        };
        // Debounce only typed search; category/sort/initial load fetch at once.
        if (search.trim()) {
            const handle = setTimeout(run, 200);
            return () => {
                cancelled = true;
                clearTimeout(handle);
            };
        }
        run();
        return () => {
            cancelled = true;
        };
    }, [search, category, sort]);

    return (
        <section style={layoutStyle} data-shell-region="live-directory">
            <header style={headerStyle}>
                <h1 style={titleStyle}>Live</h1>
                <p style={subtitleStyle}>
                    Streams from creators across {BLACKOUT_TERMS.canopy.plural} you can join.
                </p>
            </header>
            <div style={controlsStyle}>
                <input
                    style={inputStyle}
                    type="search"
                    placeholder="Search streams…"
                    aria-label="Search streams"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    data-testid="live-directory-search"
                />
                <select
                    style={selectStyle}
                    aria-label="Sort streams"
                    value={sort}
                    onChange={(e) => setSort(e.target.value as StreamSort)}
                    data-testid="live-directory-sort"
                >
                    <option value="live">Live first</option>
                    <option value="recent">Recently updated</option>
                    <option value="title">Title (A–Z)</option>
                </select>
            </div>
            {categories.length > 0 ? (
                <div style={chipRowStyle} data-testid="live-directory-categories">
                    <button
                        type="button"
                        style={chip(category === null)}
                        onClick={() => setCategory(null)}
                        data-testid="live-directory-category-all"
                    >
                        All
                    </button>
                    {categories.map((cat) => (
                        <button
                            key={cat.name}
                            type="button"
                            style={chip(category === cat.name)}
                            onClick={() =>
                                setCategory((prev) => (prev === cat.name ? null : cat.name))
                            }
                            data-testid="live-directory-category"
                            data-category={cat.name}
                        >
                            {cat.name} ({cat.live})
                        </button>
                    ))}
                </div>
            ) : null}
            {forbidden ? (
                <p style={emptyStyle} data-testid="live-directory-forbidden">
                    Streaming isn’t available on your account yet.
                </p>
            ) : error ? (
                <p style={emptyStyle} data-testid="live-directory-error">
                    {error}
                </p>
            ) : !loaded ? (
                <p style={emptyStyle}>Loading streams…</p>
            ) : streams.length === 0 ? (
                <p style={emptyStyle} data-testid="live-directory-empty">
                    {search.trim() || category
                        ? 'No streams match your filters.'
                        : 'No streams are live right now. Check back soon.'}
                </p>
            ) : (
                <div style={sectionStyle} data-testid="live-directory-grid">
                    {streams.map((stream) => (
                        <StreamCard key={stream.id} stream={stream} />
                    ))}
                </div>
            )}
        </section>
    );
};

export default LiveDirectory;
