import { type CSSProperties, useCallback } from 'react';
import type { Room } from 'matrix-js-sdk';
import type { RoomPinnedEventsEventContent } from 'matrix-js-sdk/lib/types';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoomPinnedEvents } from '../../hooks/useRoomPinnedEvents';
import { useRoomEvent } from '../../hooks/useRoomEvent';
import { readPowerLevel, usePowerLevels } from '../../hooks/usePowerLevels';
import { StateEvent } from '../../../types/matrix/room';
import { getStateEvent } from '../../utils/room';
import { getTimelineBody } from '../right-panel/rightPanelUtils';

const PANEL_WIDTH = 320;

const ASIDE_STYLE: CSSProperties = {
    width: PANEL_WIDTH,
    flex: `0 0 ${PANEL_WIDTH}px`,
    borderLeft: '1px solid var(--border-default)',
    background: 'var(--bg-nav)',
    color: 'var(--text-primary)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
};

const HEADER_STYLE: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 14px',
    borderBottom: '1px solid var(--border-default)',
    minHeight: 52,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
};

const LIST_STYLE: CSSProperties = {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
};

const rowStyle: CSSProperties = {
    display: 'grid',
    gap: 4,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    borderRadius: 8,
    padding: '8px 10px',
};

const unpinButtonStyle: CSSProperties = {
    justifySelf: 'start',
    border: '1px solid var(--border-default)',
    background: 'transparent',
    color: 'var(--text-muted)',
    borderRadius: 6,
    padding: '2px 8px',
    fontSize: 11,
    cursor: 'pointer',
};

const PinnedRow = ({
    room,
    eventId,
    canUnpin,
    onUnpin,
}: {
    room: Room;
    eventId: string;
    canUnpin: boolean;
    onUnpin: (eventId: string) => void;
}) => {
    const event = useRoomEvent(room, eventId);

    const body =
        event === undefined
            ? 'Loading…'
            : event === null
            ? '[unavailable message]'
            : getTimelineBody(event);
    const sender = event ? event.sender?.name ?? event.getSender() ?? '' : '';

    return (
        <div style={rowStyle} data-testid="canopy-pin-row">
            {sender ? (
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {sender}
                </span>
            ) : null}
            <span
                style={{
                    fontSize: 13,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                }}
            >
                {body || 'Pinned message'}
            </span>
            {canUnpin ? (
                <button
                    type="button"
                    style={unpinButtonStyle}
                    data-testid="canopy-pin-unpin"
                    onClick={() => onUnpin(eventId)}
                >
                    Unpin
                </button>
            ) : null}
        </div>
    );
};

const PinsPanelInner = ({ room }: { room: Room }) => {
    const mx = useMatrixClient();
    const powerLevels = usePowerLevels(room);
    const pinnedIds = useRoomPinnedEvents(room);

    const canUnpin =
        readPowerLevel.user(powerLevels, mx.getUserId() ?? undefined) >=
        readPowerLevel.state(powerLevels, StateEvent.RoomPinnedEvents);

    const handleUnpin = useCallback(
        (eventId: string) => {
            const pinEvent = getStateEvent(room, StateEvent.RoomPinnedEvents);
            const content = pinEvent?.getContent<RoomPinnedEventsEventContent>() ?? { pinned: [] };
            const next: RoomPinnedEventsEventContent = {
                pinned: content.pinned.filter((id) => id !== eventId),
            };
            void mx.sendStateEvent(room.roomId, StateEvent.RoomPinnedEvents as any, next);
        },
        [mx, room]
    );

    return (
        <aside
            data-testid="canopy-pins-panel"
            data-shell-region="canopy-pins"
            aria-label="Pinned messages"
            style={ASIDE_STYLE}
        >
            <div style={HEADER_STYLE}>Pinned — {pinnedIds.length}</div>
            <div style={LIST_STYLE}>
                {pinnedIds.length === 0 ? (
                    <small style={{ color: 'var(--text-muted)' }}>
                        No pinned messages yet. Pin a message to keep it handy here.
                    </small>
                ) : (
                    pinnedIds.map((eventId) => (
                        <PinnedRow
                            key={eventId}
                            room={room}
                            eventId={eventId}
                            canUnpin={canUnpin}
                            onUnpin={handleUnpin}
                        />
                    ))
                )}
            </div>
        </aside>
    );
};

/**
 * Docked pinned-messages panel for the canopy server page. Mirrors
 * `CanopyThreadsPanel`'s vanilla-inline structure rather than embedding the
 * heavy folds-based `RoomPinMenu`. Reads pinned ids via `useRoomPinnedEvents`,
 * resolves each to a message with `useRoomEvent`, and unpins by rewriting the
 * `m.room.pinned_events` state event (the same approach `RoomPinMenu` uses).
 * The room-dependent hooks live in `PinsPanelInner`, which only mounts with a
 * resolved room, so an unsynced room id never feeds a null room into a hook.
 */
export const CanopyPinsPanel = ({ roomId }: { roomId: string }) => {
    const mx = useMatrixClient();
    const room = mx.getRoom(roomId);

    if (!room) {
        return (
            <aside
                data-testid="canopy-pins-panel"
                data-shell-region="canopy-pins"
                aria-label="Pinned messages"
                style={ASIDE_STYLE}
            >
                <div style={HEADER_STYLE}>Pinned — 0</div>
                <div style={LIST_STYLE}>
                    <small style={{ color: 'var(--text-muted)' }}>No pinned messages yet.</small>
                </div>
            </aside>
        );
    }

    return <PinsPanelInner room={room} />;
};

export default CanopyPinsPanel;
