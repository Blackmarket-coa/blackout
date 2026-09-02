import { useEffect, useState } from 'react';
import { fetchCircleMap } from './profileClient';

interface CircleMapBlockProps {
    userId: string;
    /** True when the viewer owns this profile — only then are toggles shown. */
    isOwner: boolean;
    /** The owner's current opt-in list; owner view only. */
    visibleUserIds?: string[];
    onChangeVisible?: (next: string[]) => void;
    displayNameFor?: (userId: string) => string;
}

const defaultDisplayName = (userId: string): string => /^@([^:\s]+):/.exec(userId)?.[1] ?? userId;

/**
 * A visible representation of someone's connections.
 *
 * Only *overlapping* circles are eligible: showing a one-way follow would expose
 * a relationship the other person never chose, whereas an overlap means both
 * people picked the edge. On top of that the owner opts in per relationship, so
 * building a Circle never publishes it as a side effect.
 *
 * Viewers see only opted-in connections. The owner additionally sees the rest,
 * because otherwise there would be nothing to opt in *from*.
 */
export const CircleMapBlock = ({
    userId,
    isOwner,
    visibleUserIds,
    onChangeVisible,
    displayNameFor = defaultDisplayName,
}: CircleMapBlockProps) => {
    const [connections, setConnections] = useState<{ userId: string; visible: boolean }[]>([]);
    const [eligibleCount, setEligibleCount] = useState(0);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetchCircleMap(userId)
            .then((result) => {
                if (cancelled) return;
                setConnections(result.connections);
                setEligibleCount(result.eligibleCount);
                setLoaded(true);
            })
            .catch(() => {
                if (!cancelled) setLoaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, [userId]);

    const optedIn = new Set(
        visibleUserIds ?? connections.filter((c) => c.visible).map((c) => c.userId)
    );

    const toggle = (id: string) => {
        if (!onChangeVisible) return;
        const next = optedIn.has(id)
            ? [...optedIn].filter((entry) => entry !== id)
            : [...optedIn, id];
        onChangeVisible(next);
    };

    if (!loaded) return null;

    if (connections.length === 0) {
        return (
            <section data-testid="circle-map-block" style={{ display: 'grid', gap: 6 }}>
                <h4 style={{ margin: 0 }}>Circle map</h4>
                <small style={{ opacity: 0.8 }}>
                    {isOwner && eligibleCount === 0
                        ? 'Nothing to show yet — a connection appears here once you and someone else both follow each other.'
                        : 'No connections shown.'}
                </small>
            </section>
        );
    }

    return (
        <section data-testid="circle-map-block" style={{ display: 'grid', gap: 8 }}>
            <h4 style={{ margin: 0 }}>Circle map</h4>
            {isOwner ? (
                <small style={{ opacity: 0.8 }}>
                    Only circles that overlap yours can appear here. Choose which ones to show —
                    nothing is public until you pick it.
                </small>
            ) : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {connections.map((connection) => {
                    const shown = optedIn.has(connection.userId);
                    return isOwner ? (
                        <button
                            key={connection.userId}
                            type="button"
                            aria-pressed={shown}
                            data-testid={`circle-map-toggle-${connection.userId}`}
                            onClick={() => toggle(connection.userId)}
                            style={{
                                border: shown
                                    ? '1px solid var(--accent-primary)'
                                    : '1px solid var(--border-default)',
                                opacity: shown ? 1 : 0.6,
                                borderRadius: 999,
                                padding: '4px 10px',
                                cursor: 'pointer',
                            }}
                        >
                            {displayNameFor(connection.userId)}
                        </button>
                    ) : (
                        <span
                            key={connection.userId}
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 999,
                                padding: '4px 10px',
                            }}
                        >
                            {displayNameFor(connection.userId)}
                        </span>
                    );
                })}
            </div>
        </section>
    );
};

export default CircleMapBlock;
