import { useCallback, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Link, useSearchParams } from 'react-router-dom';
import type { Room } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { mDirectAtom, useBindMDirectAtom } from '../../state/mDirectList';
import { invitedRoomsAtom, joinedRoomsAtom } from '../../state/rooms';
import { useInboxModel } from '../navigation/useInboxModel';
import { startDirectMessage } from '../profile/useProfileActions';
import { getDirectPath } from '../../pages/pathUtils';
import type { MessagingTab } from './messagingTabs';

const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    textAlign: 'left',
    cursor: 'pointer',
};

const emptyStyle: React.CSSProperties = {
    margin: 0,
    color: 'var(--text-secondary)',
    fontSize: 13,
};

const smallButtonStyle: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: 12,
};

const DmList = ({ rooms, onOpen }: { rooms: Room[]; onOpen: (roomId: string) => void }) => {
    if (rooms.length === 0) {
        return (
            <p style={emptyStyle} data-testid="messaging-dms-empty">
                No locked-in chats yet. Start one from a profile, or from a marketplace
                vendor&apos;s listing.
            </p>
        );
    }
    return (
        <div style={{ display: 'grid', gap: 8 }} data-testid="messaging-dms-list">
            {rooms.map((room) => (
                <button
                    key={room.roomId}
                    type="button"
                    style={rowStyle}
                    data-testid="messaging-dm-row"
                    onClick={() => onOpen(room.roomId)}
                >
                    <span>{room.name || room.roomId}</span>
                    <span aria-hidden style={{ color: 'var(--text-secondary)' }}>
                        →
                    </span>
                </button>
            ))}
        </div>
    );
};

const NotificationsList = () => {
    const { items, markMentionRead, markAllRead } = useInboxModel();
    const { navigateRoom } = useRoomNavigate();

    if (items.length === 0) {
        return (
            <p style={emptyStyle} data-testid="messaging-notifications-empty">
                No mentions yet — replies and mentions from your dens land here.
            </p>
        );
    }
    return (
        <div style={{ display: 'grid', gap: 8 }} data-testid="messaging-notifications-list">
            <div>
                <button
                    type="button"
                    style={smallButtonStyle}
                    data-testid="messaging-mark-all-read"
                    onClick={() => void markAllRead()}
                >
                    Mark all read
                </button>
            </div>
            {items.map((item) => (
                <button
                    key={item.eventId}
                    type="button"
                    style={{ ...rowStyle, opacity: item.unread ? 1 : 0.65 }}
                    data-testid="messaging-notification-row"
                    onClick={() => {
                        void markMentionRead(item.roomId, item.eventId);
                        navigateRoom(item.roomId, item.eventId);
                    }}
                >
                    <span style={{ display: 'grid', gap: 2 }}>
                        <strong style={{ fontSize: 13 }}>{item.roomName}</strong>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {item.body}
                        </span>
                    </span>
                    {item.unread ? (
                        <span
                            aria-label="Unread"
                            style={{
                                width: 8,
                                height: 8,
                                borderRadius: 999,
                                background: 'var(--bg-accent)',
                                flexShrink: 0,
                            }}
                        />
                    ) : null}
                </button>
            ))}
        </div>
    );
};

const InvitesList = ({ onOpen }: { onOpen: (roomId: string) => void }) => {
    const mx = useMatrixClient();
    const invites = useAtomValue(invitedRoomsAtom);
    const [decliningId, setDecliningId] = useState<string | null>(null);

    const decline = useCallback(
        async (roomId: string) => {
            setDecliningId(roomId);
            try {
                await mx.leave(roomId);
            } catch (err) {
                console.warn('[messaging] failed to decline invite', err);
            } finally {
                setDecliningId(null);
            }
        },
        [mx]
    );

    if (invites.length === 0) {
        return (
            <p style={emptyStyle} data-testid="messaging-invites-empty">
                No pending invites.
            </p>
        );
    }
    return (
        <div style={{ display: 'grid', gap: 8 }} data-testid="messaging-invites-list">
            {invites.map((room) => (
                <div key={room.roomId} style={{ ...rowStyle, cursor: 'default' }}>
                    <span>{room.name || room.roomId}</span>
                    <span style={{ display: 'flex', gap: 8 }}>
                        <button
                            type="button"
                            style={{
                                ...smallButtonStyle,
                                background: 'var(--bg-accent)',
                                color: 'var(--text-on-accent)',
                            }}
                            data-testid="messaging-invite-open"
                            onClick={() => onOpen(room.roomId)}
                        >
                            Open
                        </button>
                        <button
                            type="button"
                            style={smallButtonStyle}
                            data-testid="messaging-invite-decline"
                            disabled={decliningId === room.roomId}
                            onClick={() => void decline(room.roomId)}
                        >
                            {decliningId === room.roomId ? 'Declining…' : 'Decline'}
                        </button>
                    </span>
                </div>
            ))}
        </div>
    );
};

const DirectCreate = () => {
    const mx = useMatrixClient();
    const { navigateRoom } = useRoomNavigate();
    const [searchParams] = useSearchParams();
    const userId = searchParams.get('userId') ?? '';
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const start = useCallback(async () => {
        setStarting(true);
        setError(null);
        try {
            await startDirectMessage(mx, navigateRoom, userId);
        } catch (err) {
            setError('Could not start the chat. The user may be unreachable.');
            console.warn('[messaging] failed to start dm', err);
        } finally {
            setStarting(false);
        }
    }, [mx, navigateRoom, userId]);

    if (!userId) {
        return (
            <p style={emptyStyle} data-testid="messaging-create-missing">
                No user selected. Open a profile or a marketplace listing to start a chat, or go
                back to <Link to={getDirectPath()}>your locked-in chats</Link>.
            </p>
        );
    }
    return (
        <div style={{ display: 'grid', gap: 12 }} data-testid="messaging-create">
            <p style={{ margin: 0 }}>
                Start an encrypted locked-in chat with <strong>{userId}</strong>?
            </p>
            {error ? (
                <p style={{ ...emptyStyle, color: 'var(--text-danger, #f87171)' }}>{error}</p>
            ) : null}
            <div>
                <button
                    type="button"
                    style={{
                        ...smallButtonStyle,
                        background: 'var(--bg-accent)',
                        color: 'var(--text-on-accent)',
                        fontSize: 13,
                    }}
                    data-testid="messaging-create-start"
                    disabled={starting}
                    onClick={() => void start()}
                >
                    {starting ? 'Starting…' : 'Start locked-in chat'}
                </button>
            </div>
        </div>
    );
};

/**
 * Body of the `/messages` surface. DMs are `m.direct` rooms; opening one
 * navigates to the canonical den route (`/communities/-/dens/<roomId>`) where
 * ClientLayout supplies the full timeline provider stack — the inbox surface
 * deliberately does not re-host RoomView. `mDirectAtom` is bound here because
 * the surface must work without ClientLayout ever having mounted; the room
 * atoms (`joinedRoomsAtom`/`invitedRoomsAtom`) are already bound globally in
 * the logged-in tree.
 */
export function MessagingTabBody({ tab }: { tab: MessagingTab }) {
    const mx = useMatrixClient();
    useBindMDirectAtom(mx, mDirectAtom);
    const mDirects = useAtomValue(mDirectAtom);
    const joinedRooms = useAtomValue(joinedRoomsAtom);
    const { navigateRoom } = useRoomNavigate();

    const dmRooms = useMemo(
        () => joinedRooms.filter((room) => mDirects.has(room.roomId)),
        [joinedRooms, mDirects]
    );

    const openRoom = useCallback((roomId: string) => navigateRoom(roomId), [navigateRoom]);

    if (tab === 'notifications') return <NotificationsList />;
    if (tab === 'invites') return <InvitesList onOpen={openRoom} />;
    if (tab === 'create') return <DirectCreate />;
    return <DmList rooms={dmRooms} onOpen={openRoom} />;
}

export default MessagingTabBody;
