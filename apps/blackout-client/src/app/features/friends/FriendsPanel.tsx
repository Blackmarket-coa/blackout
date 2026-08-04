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

export const friendsButtonStyle = (variant: 'primary' | 'subtle' | 'danger'): CSSProperties => ({
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

export interface FriendsPanelProps {
    /**
     * Called once a "Message" action has navigated away. The dialog uses this
     * to close itself; the canopies tab leaves it unset because navigating is
     * already the whole outcome there.
     */
    onNavigatedAway?: () => void;
}

/**
 * The friends list body: incoming requests (accept/decline), confirmed friends
 * (message/remove), and outgoing pending requests. A thin shell over
 * `useFriends` + `useFriendInbox` + `friendActions`.
 *
 * Chrome-free on purpose so it can render both inside {@link FriendsDialog} and
 * as a tab on the canopies hub.
 */
export const FriendsPanel = ({ onNavigatedAway }: FriendsPanelProps) => {
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
        <div data-testid="friends-panel">
            {incoming.length > 0 ? (
                <Section label={`Requests — ${incoming.length}`}>
                    {incoming.map((req) => (
                        <div key={req.userId} style={rowStyle} data-testid="friend-incoming">
                            <span style={nameStyle} title={req.userId}>
                                {name(req.userId)}
                            </span>
                            <button
                                type="button"
                                style={friendsButtonStyle('primary')}
                                disabled={busy}
                                data-testid="friend-accept"
                                onClick={() =>
                                    void run(async () => {
                                        await acceptFriendRequest(mx, req);
                                        // Follow back so friendship activity is mutual;
                                        // best-effort — never fail the accept over a
                                        // missing Blackout token.
                                        await followUser(req.userId).catch(() => {});
                                    })
                                }
                            >
                                Accept
                            </button>
                            <button
                                type="button"
                                style={friendsButtonStyle('subtle')}
                                disabled={busy}
                                data-testid="friend-decline"
                                onClick={() => void run(() => declineFriendRequest(mx, req))}
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
                                style={friendsButtonStyle('subtle')}
                                disabled={busy}
                                onClick={() =>
                                    void run(async () => {
                                        await startDirectMessageWith(mx, navigateRoom, userId);
                                        onNavigatedAway?.();
                                    })
                                }
                            >
                                Message
                            </button>
                            <button
                                type="button"
                                style={friendsButtonStyle('danger')}
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
    );
};

export default FriendsPanel;
