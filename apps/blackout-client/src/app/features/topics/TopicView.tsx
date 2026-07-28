import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { buildCommunitiesPath, COMMUNITIES_PATH } from '../../pages/paths';
import {
    listCanopiesByTag,
    type ListCanopiesByTagResponse,
    type TopicCanopySummary,
} from './topicsClient';
import { useTopicFollows } from '../home/discoveryInterests';
import { TopicChipBar } from './TopicChipBar';

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
    borderBottom: '1px solid var(--border-default, #374151)',
};

const titleStyle: CSSProperties = { margin: 0, fontSize: 20 };
const subStyle: CSSProperties = { margin: 0, color: 'var(--text-muted, #9ca3af)', fontSize: 13 };

const titleRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
};

const followButtonStyle: CSSProperties = {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid var(--accent-primary, #3b82f6)',
    background: 'var(--accent-primary, #3b82f6)',
    color: 'var(--text-primary, #f8fafc)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
};

const followingButtonStyle: CSSProperties = {
    ...followButtonStyle,
    background: 'transparent',
    color: 'var(--accent-primary, #3b82f6)',
};

const listStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '12px 16px',
};

const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '12px 14px',
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 10,
    background: 'var(--bg-input, #0f172a)',
    color: 'inherit',
    textDecoration: 'none',
};

const cardTitleStyle: CSSProperties = { fontSize: 15, fontWeight: 600 };
const cardBioStyle: CSSProperties = { fontSize: 13, color: 'var(--text-muted, #9ca3af)' };
const cardTagsStyle: CSSProperties = { fontSize: 11, color: 'var(--text-muted, #9ca3af)' };

const emptyStyle: CSSProperties = {
    padding: '24px 16px',
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 13,
};

const TopicCanopyCard = ({ canopy }: { canopy: TopicCanopySummary }): JSX.Element => (
    <Link
        to={buildCommunitiesPath(canopy.id, null)}
        style={cardStyle}
        data-testid="topic-canopy-card"
    >
        <span style={cardTitleStyle}>{canopy.name}</span>
        {canopy.bio ? <span style={cardBioStyle}>{canopy.bio}</span> : null}
        <span style={cardTagsStyle}>{canopy.tags.join(' · ') || ' '}</span>
    </Link>
);

/**
 * Topic detail page mounted at `/topics/:tag`. Renders a chip bar (the
 * full topic strip with the active tag highlighted) plus a list of
 * canopies tagged with `:tag`. Falls back to a `Link` to the
 * communities root when the tag has zero canopies (cold start / typo
 * route).
 */
export const TopicView = (): JSX.Element => {
    const { tag } = useParams<{ tag: string }>();
    const decoded = tag ? decodeURIComponent(tag) : '';
    const [response, setResponse] = useState<ListCanopiesByTagResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { isFollowing, follow, unfollow, canFollow } = useTopicFollows();
    const following = decoded ? isFollowing(decoded) : false;

    useEffect(() => {
        if (!decoded) return;
        let cancelled = false;
        setResponse(null);
        setError(null);
        listCanopiesByTag(decoded, { limit: 50 })
            .then((value) => {
                if (cancelled) return;
                setResponse(value);
            })
            .catch((err) => {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : 'failed to load topic');
            });
        return () => {
            cancelled = true;
        };
    }, [decoded]);

    return (
        <section style={layoutStyle} data-shell-region="topic-view" data-topic-tag={decoded}>
            <header style={headerStyle}>
                <div style={titleRowStyle}>
                    <h1 style={titleStyle}>#{decoded || 'topic'}</h1>
                    {canFollow && decoded ? (
                        <button
                            type="button"
                            style={following ? followingButtonStyle : followButtonStyle}
                            aria-pressed={following}
                            data-testid="topic-follow-button"
                            onClick={() => {
                                void (following ? unfollow(decoded) : follow(decoded)).catch(
                                    () => undefined
                                );
                            }}
                        >
                            {following ? 'Following ✓' : 'Follow topic'}
                        </button>
                    ) : null}
                </div>
                <p style={subStyle}>
                    {BLACKOUT_TERMS.canopy.titlePlural} tagged with #{decoded || 'this topic'}.
                    {following
                        ? ' Followed — posts with this tag rank higher in your For You feed.'
                        : ''}
                </p>
            </header>
            <TopicChipBar activeTag={decoded} />
            {error ? (
                <p style={emptyStyle}>Could not load this topic: {error}</p>
            ) : response === null ? (
                <p style={emptyStyle}>Loading…</p>
            ) : response.items.length === 0 ? (
                <p style={emptyStyle}>
                    No {BLACKOUT_TERMS.canopy.plural} are tagged with #{decoded} yet.{' '}
                    <Link to={COMMUNITIES_PATH}>Browse all {BLACKOUT_TERMS.canopy.plural}</Link>.
                </p>
            ) : (
                <div style={listStyle} data-testid="topic-canopy-list">
                    {response.items.map((canopy) => (
                        <TopicCanopyCard key={canopy.id} canopy={canopy} />
                    ))}
                </div>
            )}
        </section>
    );
};

export default TopicView;
