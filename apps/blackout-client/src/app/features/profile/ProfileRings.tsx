import React, { useEffect, useState, type CSSProperties } from 'react';
import { fetchRings, type RingView } from '../coalition/coalitionClient';

const chipStyle: CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-default)',
    borderRadius: 999,
    padding: '4px 10px',
};
const mutedStyle: CSSProperties = { fontSize: 13, color: 'var(--text-secondary)' };

/** A user's rings, shown on their profile in place of follower metrics. */
export function ProfileRings({ userId }: { userId: string }): React.ReactElement | null {
    const [rings, setRings] = useState<RingView[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetchRings(userId)
            .then((res) => {
                if (!cancelled) {
                    setRings(res.rings);
                    setLoaded(true);
                }
            })
            .catch(() => {
                if (!cancelled) setLoaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, [userId]);

    if (!loaded) return null;
    if (rings.length === 0) return <span style={mutedStyle}>Not in any rings yet.</span>;
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {rings.map((ring) => (
                <span key={ring.id} style={chipStyle} title={`${ring.kind} · ${ring.memberCount} members`}>
                    {ring.name} · {ring.memberCount}
                </span>
            ))}
        </div>
    );
}

export default ProfileRings;
