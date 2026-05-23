import React, { useCallback, useEffect, useState } from 'react';
import { RoomEvent, type MatrixClient } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { joinDenWithCanopy } from './joinDenWithCanopy';

const MAX_ATTEMPTS = 5;
const MAX_KEY_ATTEMPTS = 3;

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

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });

/**
 * Turn a raw join error into a sentence a tester can act on. The previous gate
 * swallowed every failure into one generic line, so a permission problem, a
 * busy server, and a dropped connection all looked identical. Distinguishing
 * them is what makes the "can't join on a fresh account" reports diagnosable.
 */
export const describeJoinFailure = (error: unknown): string => {
    const err = error as
        | { errcode?: string; httpStatus?: number; message?: string }
        | null
        | undefined;
    const code = err?.errcode;
    const status = err?.httpStatus;
    const message = (err?.message ?? '').toLowerCase();

    if (code === 'M_FORBIDDEN' || status === 403 || message.includes('forbidden')) {
        return 'You don’t have access to this den yet — you may need an invite, or to join its community first.';
    }
    if (code === 'M_LIMIT_EXCEEDED' || status === 429) {
        return 'The server is busy right now. Wait a moment, then try again.';
    }
    if (
        message.includes('network') ||
        message.includes('fetch') ||
        message.includes('connection') ||
        message.includes('timeout')
    ) {
        return 'Couldn’t reach the server. Check your connection, then try again.';
    }
    return 'Couldn’t join this den just yet.';
};

const roomIsEncrypted = (mx: MatrixClient, roomId: string): boolean => {
    try {
        return mx.getRoom(roomId)?.hasEncryptionStateEvent?.() ?? false;
    } catch {
        return false;
    }
};

// `restoreKeyBackup` pulls every room key at once, so once it has run for this
// session there's nothing to gain by repeating it each time another encrypted
// den is opened.
let sessionKeysRestored = false;

/** Test-only: clears the once-per-session key-recovery guard between cases. */
export const resetKeyRecoveryGuardForTests = (): void => {
    sessionKeysRestored = false;
};

/**
 * Recover the encryption keys needed to read an encrypted den's history.
 *
 * A brand-new account has no server-side key backup yet, so there is nothing
 * to recover and this returns immediately — the den's freshly-issued keys are
 * already usable. A returning account (or a new device) that has a backup gets
 * its keys restored so the timeline decrypts instead of showing a wall of
 * "unable to decrypt".
 */
const recoverRoomKeys = async (mx: MatrixClient): Promise<void> => {
    if (sessionKeysRestored) return;
    const crypto = mx.getCrypto?.();
    if (!crypto?.getActiveSessionBackupVersion) return;

    const backupVersion = await crypto.getActiveSessionBackupVersion();
    if (!backupVersion) return; // No backup (e.g. a fresh account): nothing to recover.

    await crypto.restoreKeyBackup();
    sessionKeysRestored = true;
};

/**
 * Gate room content (timeline AND composer) behind a confirmed `join`
 * membership and, for encrypted dens, behind a best-effort key recovery, so an
 * invited recipient can't hit the composer's 403 ("not in room") before they
 * are actually in the room — and so a fresh account doesn't land on an
 * undecryptable timeline before its keys are restored.
 *
 * Phase 1 — join: the redeem flow force-joins the recipient server-side and
 * also calls `joinRoom` optimistically, but either can race this client's
 * `/sync`: until the join surfaces, `getMyMembership()` is `invite` or still
 * unknown (`null`). This gate joins on open (retrying with backoff while the
 * membership syncs). Rooms the user explicitly left/was banned from are NOT
 * auto-rejoined — they get a manual "Join den" button instead. When every
 * retry fails the user sees *why* (permission / busy server / network) rather
 * than a single opaque line.
 *
 * Phase 2 — keys: once joined, if the den is encrypted we recover the user's
 * key backup (a no-op on a brand-new account) so encrypted history decrypts.
 * This is best-effort: a recovery failure never traps the user out of the den,
 * since new messages decrypt with the freshly-shared keys regardless.
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
        () => mx.getRoom(roomId)?.getMyMembership() ?? null,
    );
    const [failureReason, setFailureReason] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);
    const [keysReady, setKeysReady] = useState(false);

    // Track membership transitions (the join below, or a sync that surfaces
    // the server-side join/invite, flips this). Reset per-room derived state.
    useEffect(() => {
        setMembership(mx.getRoom(roomId)?.getMyMembership() ?? null);
        setKeysReady(false);
        setFailureReason(null);
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

    // Phase 1: membership join.
    useEffect(() => {
        if (isJoined) return;
        if (!autoJoinable && retryKey === 0) return;
        let cancelled = false;
        setFailureReason(null);

        void (async () => {
            for (let attempt = 1; attempt <= MAX_ATTEMPTS && !cancelled; attempt += 1) {
                try {
                    await joinDenWithCanopy(mx, roomId, canopyId);
                    if (!cancelled) setMembership('join');
                    return;
                } catch (error) {
                    if (cancelled) return;
                    if (attempt === MAX_ATTEMPTS) {
                        setFailureReason(describeJoinFailure(error));
                        return;
                    }
                    await sleep(400 * attempt);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [mx, roomId, canopyId, isJoined, autoJoinable, retryKey]);

    // Phase 2: recover encryption keys for the joined den (best-effort).
    useEffect(() => {
        if (!isJoined || keysReady) return;
        if (!roomIsEncrypted(mx, roomId)) {
            setKeysReady(true);
            return;
        }
        let cancelled = false;

        void (async () => {
            for (let attempt = 1; attempt <= MAX_KEY_ATTEMPTS && !cancelled; attempt += 1) {
                try {
                    await recoverRoomKeys(mx);
                    break;
                } catch {
                    if (cancelled) return;
                    if (attempt === MAX_KEY_ATTEMPTS) break;
                    await sleep(400 * attempt);
                }
            }
            // Recovery is best-effort: open the den either way. A fresh account
            // has nothing to recover, and new messages decrypt regardless.
            if (!cancelled) setKeysReady(true);
        })();

        return () => {
            cancelled = true;
        };
    }, [mx, roomId, isJoined, keysReady]);

    const retry = useCallback(() => {
        setFailureReason(null);
        setRetryKey((n) => n + 1);
    }, []);

    if (isJoined) {
        // Only hold an encrypted den back until its keys are recovered; a plain
        // den (or one whose recovery has finished) opens immediately.
        if (keysReady || !roomIsEncrypted(mx, roomId)) {
            return <>{children}</>;
        }
        return (
            <div style={centerStyle}>
                <p style={{ margin: 0, opacity: 0.9 }}>Setting up secure messaging…</p>
            </div>
        );
    }

    const joining = (autoJoinable || retryKey > 0) && failureReason == null;
    return (
        <div style={centerStyle}>
            {joining ? (
                <p style={{ margin: 0, opacity: 0.9 }}>Joining the den…</p>
            ) : (
                <div>
                    <p style={{ margin: 0 }}>
                        {failureReason ?? 'Couldn’t join this den just yet.'}
                    </p>
                    <button type="button" style={buttonStyle} onClick={retry}>
                        Join den
                    </button>
                </div>
            )}
        </div>
    );
};

export default RoomInviteAcceptGate;
