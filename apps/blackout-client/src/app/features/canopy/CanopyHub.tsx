import { type CSSProperties, useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import { joinedRoomsAtom } from '../../state/rooms';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { canopyUnreadsAtom } from '../../state/canopyUnreads';
import { createSpaceModalAtom } from '../../state/createSpaceModal';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { DiscoverySurface } from '../discovery/DiscoverySurface';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { GlossaryTerm } from '../../lib/GlossaryTerm';

const PAGE_STYLE: CSSProperties = {
    height: '100%',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
};

const HEADER_STYLE: CSSProperties = {
    padding: '16px 20px',
    borderBottom: '1px solid var(--border-default)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
};

const newButtonStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    background: 'var(--accent-primary)',
    color: 'var(--bg-surface)',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
};

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
 * Homepage-reachable directory of the user's canopies. Each card previews a
 * canopy (name, member count, aggregate unread, description) and opens the
 * Discord-style server page; the discovery surface below finds new ones.
 */
export const CanopyHub = () => {
    const rooms = useAtomValue(joinedRoomsAtom);
    const roomToParents = useAtomValue(roomToParentsAtom);
    const setCreateSpaceModal = useSetAtom(createSpaceModalAtom);
    const { navigateRoom, navigateSpace } = useRoomNavigate();

    const canopies = useMemo(() => rooms.filter((room) => room.getType() === 'm.space'), [rooms]);

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

    return (
        <section data-testid="canopy-hub" data-shell-region="room" style={PAGE_STYLE}>
            <header style={HEADER_STYLE}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 20 }}>{BLACKOUT_TERMS.canopy.titlePlural}</h1>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
                        Your{' '}
                        <GlossaryTerm term="canopy">{BLACKOUT_TERMS.canopy.plural}</GlossaryTerm> —
                        communities made of{' '}
                        <GlossaryTerm term="den">{BLACKOUT_TERMS.den.plural}</GlossaryTerm>. Open
                        one or discover more below.
                    </p>
                </div>
                <button
                    type="button"
                    style={newButtonStyle}
                    data-testid="canopy-hub-create"
                    onClick={() => setCreateSpaceModal({})}
                >
                    ＋ New {BLACKOUT_TERMS.canopy.singular}
                </button>
            </header>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                {canopies.length > 0 ? (
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
                                            <span style={badgeStyle}>
                                                {unread > 99 ? '99+' : unread}
                                            </span>
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
                                        <p
                                            data-testid="canopy-hub-card-activity"
                                            style={{
                                                margin: 0,
                                                color: 'var(--text-secondary)',
                                                fontSize: 13,
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                                overflow: 'hidden',
                                            }}
                                        >
                                            {latest.sender ? (
                                                <strong style={{ fontWeight: 600 }}>
                                                    {latest.sender}:{' '}
                                                </strong>
                                            ) : null}
                                            {latest.body}
                                        </p>
                                    ) : topic ? (
                                        <p
                                            style={{
                                                margin: 0,
                                                color: 'var(--text-secondary)',
                                                fontSize: 13,
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                                overflow: 'hidden',
                                            }}
                                        >
                                            {topic}
                                        </p>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <p style={{ padding: 20, color: 'var(--text-muted)' }}>
                        You haven’t joined any {BLACKOUT_TERMS.canopy.plural} yet — discover one
                        below.
                    </p>
                )}

                <div
                    style={{
                        padding: '4px 20px 8px',
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: 0.6,
                    }}
                >
                    Discover
                </div>
                <DiscoverySurface
                    onSelectRoom={(roomId) => navigateRoom(roomId)}
                    onSelectSpace={(spaceId) => navigateSpace(spaceId)}
                />
            </div>
        </section>
    );
};

export default CanopyHub;
