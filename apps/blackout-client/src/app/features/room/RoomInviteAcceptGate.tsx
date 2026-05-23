import React, { useCallback, useEffect, useState } from 'react';
import { RoomEvent } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';

const MAX_ATTEMPTS = 5;

const centerStyle: React.CSSProperties = {
    height: '100%',
    display: 'grid',
    placeItems: 'center',
    padding: 24,
    textAlign: 'center',
    color: 'var(--text-primary)',
};

const buttonStyle: React.CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    background: 'var(--accent-primary, #2563eb)',
    color: 'var(--bg-surface, #fff)',
    padding: '6px 14px',
    cursor: 'pointer',
    marginTop: 12,
};

/**
 * Auto-accept an `invite` membership when a room is opened, so an invited
 * recipient can post immediately. The redeem flow already calls `joinRoom`
 * optimistically, but that can race the server-side invite (or be interrupted
 * by the post-redeem navigation/reload), leaving membership at `invite` — and
 * the composer then 403s ("not in room"). This gate is the reliable safety
 * net: it joins on open (retrying while the bot invite syncs) and only renders
 * the room content (`children`) once membership is `join` (or wasn't `invite`).
 */
export const RoomInviteAcceptGate: React.FC<{
    roomId: string;
    children: React.ReactNode;
}> = ({ roomId, children }) => {
    const mx = useMatrixClient();
    const [membership, setMembership] = useState<string | null>(
        () => mx.getRoom(roomId)?.getMyMembership() ?? null,
    );
    const [failed, setFailed] = useState(false);
    const [retryKey, setRetryKey] = useState(0);

    // Track membership transitions (the join below, or a sync that surfaces
    // the bot invite, flips this).
    useEffect(() => {
        setMembership(mx.getRoom(roomId)?.getMyMembership() ?? null);
        const onMyMembership = (room: { roomId: string; getMyMembership: () => string }) => {
            if (room.roomId === roomId) setMembership(room.getMyMembership());
        };
        mx.on(RoomEvent.MyMembership, onMyMembership as never);
        return () => {
            mx.off(RoomEvent.MyMembership, onMyMembership as never);
        };
    }, [mx, roomId]);

    // Auto-join while membership is `invite`, retrying with backoff because the
    // bot's invite may not have reached this client's /sync yet.
    useEffect(() => {
        if (membership !== 'invite') return;
        let cancelled = false;
        setFailed(false);

        void (async () => {
            for (let attempt = 1; attempt <= MAX_ATTEMPTS && !cancelled; attempt += 1) {
                try {
                    await mx.joinRoom(roomId);
                    if (!cancelled) setMembership('join');
                    return;
                } catch {
                    if (cancelled) return;
                    await new Promise((resolve) => {
                        window.setTimeout(resolve, 400 * attempt);
                    });
                }
            }
            if (!cancelled) setFailed(true);
        })();

        return () => {
            cancelled = true;
        };
    }, [mx, roomId, membership, retryKey]);

    const retry = useCallback(() => {
        setFailed(false);
        setRetryKey((n) => n + 1);
    }, []);

    if (membership === 'invite') {
        return (
            <div style={centerStyle}>
                {failed ? (
                    <div>
                        <p style={{ margin: 0 }}>Couldn’t join this den just yet.</p>
                        <button type="button" style={buttonStyle} onClick={retry}>
                            Join den
                        </button>
                    </div>
                ) : (
                    <p style={{ margin: 0, opacity: 0.9 }}>Joining the den…</p>
                )}
            </div>
        );
    }

    return <>{children}</>;
};

export default RoomInviteAcceptGate;
