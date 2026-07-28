import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { TagChip } from '../../components/tag-chip/TagChip';
import { useTopicFollows } from '../home/discoveryInterests';
import { listTopics, type TopicSummary } from './topicsClient';

const containerStyle: CSSProperties = {
    display: 'flex',
    gap: 8,
    overflowX: 'auto',
    padding: '8px 16px',
    scrollbarWidth: 'thin',
    WebkitOverflowScrolling: 'touch',
};

const buildTopicPath = (tag: string): string => `/topics/${encodeURIComponent(tag)}`;

export type TopicChipBarProps = {
    /**
     * Active tag highlights its chip. Pass `null` for "all topics" /
     * default state.
     */
    activeTag?: string | null;
    /**
     * Bound when the user taps a chip; the consumer typically pushes a
     * new route or applies a local filter. When omitted, chips are
     * inert links to `/topics/:tag`.
     */
    onSelect?: (tag: string) => void;
    /**
     * Trims the bar to the top-N topics. Mirrors the server default
     * (50) but UX docs target ~10 visible.
     */
    limit?: number;
};

/**
 * Horizontally-scrollable strip of the most-frequent topic tags. Reads
 * from `topicsClient.listTopics` once on mount and stays stable until
 * remounted — the discovery service updates indexes on a rolling
 * background, so a freshly-mounted chip bar reflects the latest
 * snapshot without re-polling.
 *
 * Renders nothing when the API returns zero topics (cold-start
 * scenario or `BLACKOUT_TOPICS=false`). Empty state is intentional:
 * HomeFeed remains usable without the chip strip.
 */
export const TopicChipBar = ({
    activeTag = null,
    onSelect,
    limit = 12,
}: TopicChipBarProps): JSX.Element | null => {
    const [topics, setTopics] = useState<TopicSummary[]>([]);
    const { followed } = useTopicFollows();

    useEffect(() => {
        let cancelled = false;
        listTopics({ limit })
            .then((response) => {
                if (cancelled) return;
                setTopics(response.items);
            })
            .catch(() => {
                // Trending is best-effort; followed pins still render below.
                if (cancelled) return;
                setTopics([]);
            });
        return () => {
            cancelled = true;
        };
    }, [limit]);

    // Followed topics lead the strip (with trending counts when known) and
    // stay visible even when they fall out of the trending window; trending
    // fills the rest up to `limit`.
    const entries = useMemo(() => {
        const trendingCount = new Map(topics.map((entry) => [entry.tag, entry.count]));
        const pinned: TopicSummary[] = [...followed]
            .sort()
            .map((tag) => ({ tag, count: trendingCount.get(tag) ?? 0 }));
        const rest = topics.filter((entry) => !followed.has(entry.tag));
        return [...pinned, ...rest].slice(0, Math.max(limit, pinned.length));
    }, [topics, followed, limit]);

    // Followed pins render even when trending fails or is empty; the bar only
    // disappears when there is truly nothing to show.
    if (entries.length === 0) return null;

    return (
        <nav aria-label="Topic chips" data-testid="topic-chip-bar" style={containerStyle}>
            {entries.map((entry) => (
                <TagChip
                    key={entry.tag}
                    label={entry.tag}
                    count={entry.count > 0 ? entry.count : undefined}
                    to={buildTopicPath(entry.tag)}
                    active={entry.tag === activeTag}
                    onSelect={onSelect}
                    data-testid={followed.has(entry.tag) ? 'topic-chip-followed' : 'tag-chip'}
                >
                    {followed.has(entry.tag) ? `★ ${entry.tag}` : entry.tag}
                </TagChip>
            ))}
        </nav>
    );
};

export default TopicChipBar;
