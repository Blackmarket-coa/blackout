import { type CSSProperties, type ReactNode, useState } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { useFriends } from './useFriends';
import { useFriendInbox } from './useFriendInbox';
import {
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
    startDirectMessageWith,
} from './friendActions';
import { followUser } from '../profile/profileClient';

const OVERLAY_STYLE: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
};

const CARD_STYLE: CSSProperties = {
    width: 'min(480px, 100%)',
    maxHeight: 'min(640px, 100%)',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
    borderRadius: 14,
    boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
};

const sectionLabelStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    padding: '14px 4px 4px',
};

const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 4px',
};

const nameStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 14,
};

const btn = (variant: 'primary' | 'subtle' | 'danger'): CSSProperties => ({
    border: '1px solid var(--border-default)',
    background:
        variant === 'primary'
            ? 'var(--accent-primary)'
            : variant === 'danger'
            ? 'transparent'
            : 'var(--bg-input)',
    color:
        variant === 'primary'
            ? 'var(--bg-surface)'
            : variant === 'danger'
            ? 'var(--danger, #f04747)'
            : 'var(--text-primary)',
    borderRadius: 8,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
});

/**
 * Friends manager: incoming requests (accept/decline), confirmed friends
 * (message/remove), and outgoing pending requests. A thin shell over
 * `useFriends` + `useFriendInbox` + `friendActions`.
 */
export const FriendsDialog = ({ onClose }: { onClose: () => void }) => {
    const mx = useMatrixClient();
    const { navigateRoom } = useRoomNavigate();
    const { friends, outgoing } = useFriends();
    const { incoming } = useFriendInbox();
    const [busy, setBusy] = useState(false);

    const name = (userId: string) => mx.getUser(userId)?.displayName ?? userId;

    const run = async (fn: () => Promise<unknown>) => {
        if (busy) return;
        setBusy(true);
        try {
            await fn();
        } finally {
            setBusy(false);
        }
    };

    const Section = ({ label, children }: { label: string; children: ReactNode }) => (
        <>
            <div style={sectionLabelStyle}>{label}</div>
            {children}
        </>
    );

    return (
        <div
            style={OVERLAY_STYLE}
            role="dialog"
            aria-modal="true"
            aria-label="Friends"
            data-testid="friends-dialog"
            onClick={onClose}
        >
            <div style={CARD_STYLE} onClick={(event) => event.stopPropagation()}>
                <header
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 16px',
                        borderBottom: '1px solid var(--border-default)',
                    }}
                >
                    <strong style={{ fontSize: 16 }}>Friends</strong>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close friends"
                        style={{ ...btn('subtle'), width: 30, height: 30, padding: 0 }}
                    >
                        ✕
                    </button>
                </header>

                <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '4px 16px 16px' }}>
                    {incoming.length > 0 ? (
                        <Section label={`Requests — ${incoming.length}`}>
                            {incoming.map((req) => (
                                <div
                                    key={req.userId}
                                    style={rowStyle}
                                    data-testid="friend-incoming"
                                >
                                    <span style={nameStyle} title={req.userId}>
                                        {name(req.userId)}
                                    </span>
                                    <button
                                        type="button"
                                        style={btn('primary')}
                                        disabled={busy}
                                        data-testid="friend-accept"
                                        onClick={() =>
                                            void run(async () => {
                                                await acceptFriendRequest(mx, req);
                                                // Follow back so friendship activity is
                                                // mutual; best-effort — never fail the
                                                // accept over a missing Blackout token.
                                                await followUser(req.userId).catch(() => {});
                                            })
                                        }
                                    >
                                        Accept
                                    </button>
                                    <button
                                        type="button"
                                        style={btn('subtle')}
                                        disabled={busy}
                                        data-testid="friend-decline"
                                        onClick={() =>
                                            void run(() => declineFriendRequest(mx, req))
                                        }
                                    >
                                        Decline
                                    </button>
                                </div>
                            ))}
                        </Section>
                    ) : null}

                    <Section label={`Friends — ${friends.length}`}>
                        {friends.length === 0 ? (
                            <small style={{ color: 'var(--text-muted)', padding: '2px 4px' }}>
                                No friends yet. Add someone from their profile.
                            </small>
                        ) : (
                            friends.map((userId) => (
                                <div key={userId} style={rowStyle} data-testid="friend-row">
                                    <span style={nameStyle} title={userId}>
                                        {name(userId)}
                                    </span>
                                    <button
                                        type="button"
                                        style={btn('subtle')}
                                        disabled={busy}
                                        onClick={() =>
                                            void run(async () => {
                                                await startDirectMessageWith(
                                                    mx,
                                                    navigateRoom,
                                                    userId
                                                );
                                                onClose();
                                            })
                                        }
                                    >
                                        Message
                                    </button>
                                    <button
                                        type="button"
                                        style={btn('danger')}
                                        disabled={busy}
                                        data-testid="friend-remove"
                                        onClick={() => void run(() => removeFriend(mx, userId))}
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))
                        )}
                    </Section>

                    {outgoing.length > 0 ? (
                        <Section label={`Pending — ${outgoing.length}`}>
                            {outgoing.map((userId) => (
                                <div key={userId} style={rowStyle} data-testid="friend-outgoing">
                                    <span style={nameStyle} title={userId}>
                                        {name(userId)}
                                    </span>
                                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                        Requested
                                    </span>
                                </div>
                            ))}
                        </Section>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

export default FriendsDialog;
