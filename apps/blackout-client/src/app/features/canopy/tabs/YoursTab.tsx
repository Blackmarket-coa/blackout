import { type CSSProperties, useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import { joinedRoomsAtom } from '../../../state/rooms';
import { roomToParentsAtom } from '../../../state/room/roomToParents';
import { canopyUnreadsAtom } from '../../../state/canopyUnreads';
import { canopyRailLayoutAtom, orderCanopiesByLayout } from '../../../state/canopyLayout';
import { createSpaceModalAtom } from '../../../state/createSpaceModal';
import { useRoomNavigate } from '../../../hooks/useRoomNavigate';
import { BLACKOUT_TERMS } from '../../../lib/blackoutTerminology';

const GRID_STYLE: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 12,
    padding: 20,
};

const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    textAlign: 'left',
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    background: 'var(--bg-nav)',
    color: 'var(--text-primary)',
    padding: 14,
    cursor: 'pointer',
};

const tileStyle: CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: 'var(--accent-muted)',
    display: 'grid',
    placeItems: 'center',
    fontSize: 18,
    fontWeight: 700,
    flex: '0 0 auto',
};

const badgeStyle: CSSProperties = {
    marginLeft: 'auto',
    minWidth: 20,
    height: 20,
    padding: '0 6px',
    borderRadius: 999,
    background: 'var(--accent-primary)',
    color: 'var(--bg-surface)',
    fontSize: 12,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const clampStyle: CSSProperties = {
    margin: 0,
    color: 'var(--text-secondary)',
    fontSize: 13,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
};

const initials = (name: string) => name.slice(0, 2).toUpperCase();

const readTopic = (room: Room): string =>
    room.currentState.getStateEvents('m.room.topic', '')?.getContent<{ topic?: string }>()?.topic ??
    '';

interface ActivityPreview {
    sender: string;
    body: string;
    ts: number;
}

const lastMessage = (room: Room): ActivityPreview | null => {
    const events = room.getLiveTimeline?.().getEvents?.() ?? [];
    for (let i = events.length - 1; i >= 0; i -= 1) {
        const event = events[i];
        if (event.getType?.() !== 'm.room.message') continue;
        const body = (event.getContent?.() as { body?: string })?.body ?? '';
        if (!body) continue;
        return {
            sender: event.sender?.name ?? event.getSender?.() ?? '',
            body,
            ts: event.getTs?.() ?? 0,
        };
    }
    return null;
};

const formatRelative = (ts: number): string => {
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'just now';
    const minutes = Math.round(diff / 60_000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
};

/**
 * The canopies you have joined. Each card previews a canopy (name, member
 * count, aggregate unread, latest activity) and opens the Discord-style server
 * page.
 */
export const YoursTab = () => {
    const rooms = useAtomValue(joinedRoomsAtom);
    const roomToParents = useAtomValue(roomToParentsAtom);
    const setCreateSpaceModal = useSetAtom(createSpaceModalAtom);
    const { navigateSpace } = useRoomNavigate();

    const railLayout = useAtomValue(canopyRailLayoutAtom);
    // Same order as the rail (folders flattened in place) so the hub cards
    // and the rail never disagree about where a canopy lives.
    const canopies = useMemo(
        () =>
            orderCanopiesByLayout(
                rooms.filter((room) => room.getType() === 'm.space'),
                railLayout
            ),
        [rooms, railLayout]
    );

    // Shared with the canopy rail badges so the two rollups never drift.
    const unreadByCanopy = useAtomValue(canopyUnreadsAtom);

    const latestByCanopy = useMemo(() => {
        const latest = new Map<string, ActivityPreview>();
        rooms.forEach((room) => {
            if (room.getType() === 'm.space') return;
            const parents = roomToParents.get(room.roomId);
            if (!parents || parents.size === 0) return;
            const preview = lastMessage(room);
            if (!preview) return;
            parents.forEach((parentId) => {
                const prev = latest.get(parentId);
                if (!prev || preview.ts > prev.ts) latest.set(parentId, preview);
            });
        });
        return latest;
    }, [rooms, roomToParents]);

    if (canopies.length === 0) {
        return (
            <div style={{ padding: 20 }}>
                <p style={{ margin: '0 0 12px', color: 'var(--text-muted)' }}>
                    You haven’t joined any {BLACKOUT_TERMS.canopy.plural} yet — try Discover, or
                    start your own.
                </p>
                <button
                    type="button"
                    style={{
                        border: '1px solid var(--border-default)',
                        background: 'var(--accent-primary)',
                        color: 'var(--bg-surface)',
                        borderRadius: 8,
                        padding: '8px 14px',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                    data-testid="canopy-hub-empty-create"
                    onClick={() => setCreateSpaceModal({})}
                >
                    ＋ New {BLACKOUT_TERMS.canopy.singular}
                </button>
            </div>
        );
    }

    return (
        <div style={GRID_STYLE} aria-label={`Your ${BLACKOUT_TERMS.canopy.plural}`}>
            {canopies.map((canopy) => {
                const unread = unreadByCanopy.get(canopy.roomId)?.total ?? 0;
                const topic = readTopic(canopy);
                const latest = latestByCanopy.get(canopy.roomId) ?? null;
                return (
                    <button
                        key={canopy.roomId}
                        type="button"
                        style={cardStyle}
                        data-testid={`canopy-hub-card-${canopy.roomId}`}
                        onClick={() => navigateSpace(canopy.roomId)}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={tileStyle} aria-hidden>
                                {initials(canopy.name || '🗂️')}
                            </span>
                            <span
                                style={{
                                    fontSize: 15,
                                    fontWeight: 600,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {canopy.name}
                            </span>
                            {unread > 0 ? (
                                <span style={badgeStyle}>{unread > 99 ? '99+' : unread}</span>
                            ) : null}
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                color: 'var(--text-muted)',
                                fontSize: 12,
                            }}
                        >
                            <span>{canopy.getJoinedMemberCount()} members</span>
                            {latest ? (
                                <span style={{ marginLeft: 'auto' }}>
                                    {formatRelative(latest.ts)}
                                </span>
                            ) : null}
                        </div>
                        {latest ? (
                            <p data-testid="canopy-hub-card-activity" style={clampStyle}>
                                {latest.sender ? (
                                    <strong style={{ fontWeight: 600 }}>{latest.sender}: </strong>
                                ) : null}
                                {latest.body}
                            </p>
                        ) : topic ? (
                            <p style={clampStyle}>{topic}</p>
                        ) : null}
                    </button>
                );
            })}
        </div>
    );
};

export default YoursTab;
