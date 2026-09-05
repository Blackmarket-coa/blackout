import classNames from 'classnames';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as css from './CircleFeed.css';
import CircleFeedCard from './CircleFeedCard';
import RelayChainDialog from './RelayChainDialog';
import OpenVoiceRooms from './OpenVoiceRooms';
import { emptyFeedReason, groupConsecutive, shouldCollapse } from './circleFeedModel';
import {
    fetchCircleFeed,
    fetchIllumination,
    fetchMyRelays,
    type CircleFeedItem,
    type IlluminationView,
} from './circleFeedClient';

interface CircleFeedProps {
    viewerId: string | null;
    displayNameFor?: (userId: string) => string;
}

type RingFilter = 'all' | 'circle' | 'reach';

const RING_FILTERS: { id: RingFilter; label: string; hint: string }[] = [
    { id: 'all', label: 'All', hint: 'Everything a person put in front of you' },
    { id: 'circle', label: 'Circle', hint: 'Posts by the people you follow' },
    { id: 'reach', label: 'Reach', hint: 'Relayed inward from beyond your Circle' },
];

/**
 * The Circle & Reach feed.
 *
 * Everything here arrived because a person chose to put it there — someone the
 * viewer follows wrote it, or someone they follow relayed it — and every item
 * carries the chain that delivered it. The server decides the contents and the
 * order (time, and nothing else); this component renders that order as given and
 * never re-sorts or re-scores it.
 */
export const CircleFeed = ({ viewerId, displayNameFor }: CircleFeedProps) => {
    const [items, setItems] = useState<CircleFeedItem[]>([]);
    const [circleSize, setCircleSize] = useState(0);
    const [illumination, setIllumination] = useState<IlluminationView | null>(null);
    const [myRelayBySubject, setMyRelayBySubject] = useState<Map<string, string>>(new Map());
    const [ring, setRing] = useState<RingFilter>('all');
    const [openChainId, setOpenChainId] = useState<string | null>(null);
    // Keyed by the run's own identity (relayer + first item), not its array
    // index: a Boost triggers a refetch that reorders groups, and an
    // index-keyed set then expands whichever run happens to land in that slot.
    const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [feed, mine] = await Promise.all([
                fetchCircleFeed(ring === 'all' ? {} : { ring }),
                fetchMyRelays().catch(() => ({ relays: [] })),
            ]);
            setItems(feed.items);
            setCircleSize(feed.circleSize);
            // Which items you have already Boosted is an enrichment: it only
            // decides whether a card's button reads Boost or Un-boost. The
            // `.catch` above covers a failed request, but a 200 whose body is
            // not the expected shape used to throw here — inside the try — and
            // surface a raw `reading 'filter'` TypeError as the feed's error
            // message, over a feed that had in fact loaded fine.
            const myRelays = Array.isArray(mine?.relays) ? mine.relays : [];
            setMyRelayBySubject(
                new Map(
                    myRelays
                        .filter((relay) => relay.active)
                        .map((relay) => [`${relay.subjectSource}:${relay.subjectId}`, relay.id])
                )
            );
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not load your feed');
        } finally {
            setLoading(false);
        }
    }, [ring]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        let cancelled = false;
        fetchIllumination()
            .then((result) => {
                if (!cancelled) setIllumination(result);
            })
            .catch(() => {
                if (!cancelled) setIllumination(null);
            });
        return () => {
            cancelled = true;
        };
    }, [items.length]);

    const groups = useMemo(() => groupConsecutive(items), [items]);

    const litPercent = illumination
        ? Math.round((illumination.litCount / Math.max(1, illumination.networkSize)) * 100)
        : 0;

    return (
        <div className={css.wrapper} data-testid="circle-feed">
            <header className={css.header}>
                <h1 className={css.heading}>Your feed</h1>
                <p className={css.subheading}>
                    Everything here was put in front of you by a person. Tap any path to see exactly
                    who.
                </p>
                <div className={css.ringFilter} role="tablist" aria-label="Feed rings">
                    {RING_FILTERS.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            role="tab"
                            title={option.hint}
                            aria-selected={ring === option.id}
                            data-testid={`circle-feed-ring-${option.id}`}
                            className={classNames(css.pill, ring === option.id && css.pillActive)}
                            onClick={() => setRing(option.id)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </header>

            {illumination ? (
                <section className={css.illumination} data-testid="illumination-meter">
                    <span>
                        Your presence lights {illumination.litCount} of {illumination.networkSize}{' '}
                        people — {illumination.unlitCount} still unlit.
                    </span>
                    <div
                        className={css.meterTrack}
                        role="meter"
                        aria-valuenow={litPercent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Illumination"
                    >
                        <div className={css.meterFill} style={{ width: `${litPercent}%` }} />
                    </div>
                </section>
            ) : null}

            <OpenVoiceRooms />

            {error ? <p className={css.empty}>{error}</p> : null}
            {loading ? <p className={css.empty}>Loading…</p> : null}

            {!loading && !error && items.length === 0 ? (
                <p className={css.empty} data-testid="circle-feed-empty">
                    {emptyFeedReason(circleSize)}
                </p>
            ) : null}

            <div className={css.list}>
                {groups.map((group, index) => {
                    const runKey = `${group.relayerUserId ?? 'circle'}:${
                        group.items[0]?.key ?? index
                    }`;
                    const collapsed = shouldCollapse(group) && !expandedRuns.has(runKey);
                    const visible = collapsed ? group.items.slice(0, 1) : group.items;
                    return (
                        <div key={runKey}>
                            <div className={css.list}>
                                {visible.map((item) => (
                                    <CircleFeedCard
                                        key={item.key}
                                        item={item}
                                        viewerId={viewerId}
                                        myRelayId={myRelayBySubject.get(item.key) ?? null}
                                        displayNameFor={displayNameFor}
                                        onOpenChain={setOpenChainId}
                                        onRelayChanged={() => void load()}
                                    />
                                ))}
                            </div>
                            {shouldCollapse(group) ? (
                                <button
                                    type="button"
                                    className={css.runToggle}
                                    data-testid="circle-feed-run-toggle"
                                    onClick={() =>
                                        setExpandedRuns((previous) => {
                                            const next = new Set(previous);
                                            if (next.has(runKey)) next.delete(runKey);
                                            else next.add(runKey);
                                            return next;
                                        })
                                    }
                                >
                                    {collapsed
                                        ? `Show ${
                                              group.items.length - 1
                                          } more relayed by this person`
                                        : 'Collapse this run'}
                                </button>
                            ) : null}
                        </div>
                    );
                })}
            </div>

            {openChainId ? (
                <RelayChainDialog
                    relayId={openChainId}
                    viewerId={viewerId}
                    displayNameFor={displayNameFor}
                    onClose={() => setOpenChainId(null)}
                />
            ) : null}
        </div>
    );
};

export default CircleFeed;
