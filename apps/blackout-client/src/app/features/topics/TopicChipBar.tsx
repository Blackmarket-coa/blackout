import { useEffect, useState, type CSSProperties } from 'react';
import { TagChip } from '../../components/tag-chip/TagChip';
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
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        listTopics({ limit })
            .then((response) => {
                if (cancelled) return;
                setTopics(response.items);
            })
            .catch((err) => {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : 'failed to load topics');
            });
        return () => {
            cancelled = true;
        };
    }, [limit]);

    if (error || topics.length === 0) return null;

    return (
        <nav aria-label="Topic chips" data-testid="topic-chip-bar" style={containerStyle}>
            {topics.map((entry) => (
                <TagChip
                    key={entry.tag}
                    label={entry.tag}
                    count={entry.count}
                    to={buildTopicPath(entry.tag)}
                    active={entry.tag === activeTag}
                    onSelect={onSelect}
                />
            ))}
        </nav>
    );
};

export default TopicChipBar;
