import { type CSSProperties } from 'react';
import type { Room } from 'matrix-js-sdk';
import { useMatrixClientOrNull } from '../../hooks/useMatrixClient';
import { PowerLevelsContextProvider, usePowerLevels } from '../../hooks/usePowerLevels';
import { useLegacyRoomAdapter } from '../../plugins/matrix-adapters/hooks/useLegacyRoomAdapter';
import { RoomInviteAcceptGate } from '../room/RoomInviteAcceptGate';
import { RoomTimeline } from '../room/RoomTimeline';
import { MessageComposer } from '../room/MessageComposer';

const panelStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: 'min(60vh, 520px)',
    borderTop: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-surface, #0f172a)',
};

const headerStyle: CSSProperties = {
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text-primary, #f8fafc)',
    borderBottom: '1px solid var(--border-default, #374151)',
};

const timelineWrapStyle: CSSProperties = {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
};

const stateStyle: CSSProperties = {
    flex: 1,
    display: 'grid',
    placeItems: 'center',
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 13,
};

function ChatBody({ room }: { room: Room }) {
    const powerLevels = usePowerLevels(room);
    return (
        <PowerLevelsContextProvider value={powerLevels}>
            <div style={timelineWrapStyle}>
                <RoomTimeline key={room.roomId} roomId={room.roomId} />
            </div>
            <MessageComposer roomId={room.roomId} placeholder="Chat with the stream…" />
        </PowerLevelsContextProvider>
    );
}

function RoomResolver({ roomId }: { roomId: string }) {
    const { data: room } = useLegacyRoomAdapter(roomId);
    if (!room) {
        return (
            <div style={stateStyle} data-testid="livestream-den-chat-loading">
                Loading chat…
            </div>
        );
    }
    return <ChatBody room={room} />;
}

/**
 * In-page den chat mounted beside the livestream player. Joins the associated
 * den (via RoomInviteAcceptGate) before rendering the room's live timeline and
 * composer, so the stream and its discussion live on one screen instead of a
 * deep link away. Renders nothing without an authenticated Matrix client.
 */
export function EmbeddedDenChat({ denId, canopyId }: { denId: string; canopyId?: string }) {
    const mx = useMatrixClientOrNull();
    if (!mx) return null;
    return (
        <section style={panelStyle} data-testid="livestream-den-chat" data-den-id={denId}>
            <header style={headerStyle}>Den chat</header>
            <RoomInviteAcceptGate roomId={denId} canopyId={canopyId}>
                <RoomResolver roomId={denId} />
            </RoomInviteAcceptGate>
        </section>
    );
}

export default EmbeddedDenChat;
