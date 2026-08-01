import React, { useCallback, useEffect, useState } from 'react';
import { RoomEvent } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { addRoomIdToMDirect } from '../../utils/matrix';
import { isDirectInvite } from '../../utils/room';
import { joinDenWithCanopy } from './joinDenWithCanopy';

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
 * Gate room content (timeline AND composer) behind a confirmed `join`
 * membership, so an invited recipient can't hit the composer's 403
 * ("not in room") before they're actually in the room.
 *
 * The redeem flow now force-joins the recipient server-side (Synapse admin
 * join) and also calls `joinRoom` optimistically, but either can race this
 * client's `/sync`: until the join surfaces, `getMyMembership()` is `invite`
 * or still unknown (`null`). This gate joins on open (retrying with backoff
 * while the membership syncs) and only renders `children` once membership is
 * `join`. Rooms the user explicitly left/was banned from are NOT auto-rejoined
 * — they get a manual "Join den" button instead.
 */
export const RoomInviteAcceptGate: React.FC<{
    roomId: string;
    /** Parent canopy (space) of the den. Joined first so the restricted den
     *  join can succeed; ignored when absent or equal to the den. */
    canopyId?: string;
    children: React.ReactNode;
}> = ({ roomId, canopyId, children }) => {
    const mx = useMatrixClient();
    const [membership, setMembership] = useState<string | null>(
        () => mx.getRoom(roomId)?.getMyMembership() ?? null
    );
    const [failed, setFailed] = useState(false);
    const [retryKey, setRetryKey] = useState(0);

    // Track membership transitions (the join below, or a sync that surfaces
    // the server-side join/invite, flips this).
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

    const isJoined = membership === 'join';
    // Auto-join when invited, or when membership is still unknown (`null`) —
    // the server-side join may not have reached this client's /sync yet, and a
    // freshly-redeemed account often opens the den before its room list
    // populates. Don't auto-rejoin rooms the user deliberately left/was banned
    // from; those only join via the manual button (retryKey > 0).
    const autoJoinable = membership === 'invite' || membership == null;

    useEffect(() => {
        if (isJoined) return;
        if (!autoJoinable && retryKey === 0) return;
        let cancelled = false;
        setFailed(false);

        // A direct (DM) invite stamps `is_direct` on our own member event, but
        // joining replaces that event — so decide up front whether this room
        // belongs in m.direct, and with whom, before the join rewrites it.
        // Without the registration the accepted DM leaks into the home feed as
        // a den card.
        const invitedRoom = mx.getRoom(roomId);
        const dmInviter = isDirectInvite(invitedRoom, mx.getUserId())
            ? invitedRoom?.getDMInviter()
            : undefined;

        void (async () => {
            for (let attempt = 1; attempt <= MAX_ATTEMPTS && !cancelled; attempt += 1) {
                try {
                    await joinDenWithCanopy(mx, roomId, canopyId);
                    if (dmInviter) {
                        // Best-effort: never block rendering the joined room on
                        // the account-data write.
                        try {
                            await addRoomIdToMDirect(mx, roomId, dmInviter);
                        } catch {
                            /* no-op */
                        }
                    }
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
    }, [mx, roomId, canopyId, isJoined, autoJoinable, retryKey]);

    const retry = useCallback(() => {
        setFailed(false);
        setRetryKey((n) => n + 1);
    }, []);

    if (isJoined) {
        return <>{children}</>;
    }

    const joining = (autoJoinable || retryKey > 0) && !failed;
    return (
        <div style={centerStyle}>
            {joining ? (
                <p style={{ margin: 0, opacity: 0.9 }}>Joining the den…</p>
            ) : (
                <div>
                    <p style={{ margin: 0 }}>Couldn’t join this den just yet.</p>
                    <button type="button" style={buttonStyle} onClick={retry}>
                        Join den
                    </button>
                </div>
            )}
        </div>
    );
};

export default RoomInviteAcceptGate;
