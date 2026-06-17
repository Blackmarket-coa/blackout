import { type CSSProperties, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { roomJumpTargetEventIdAtom } from '../../state/navigation';
import { getUnreadMarkerEventId } from '../right-panel/rightPanelUtils';
import { RoomTimeline } from '../room/RoomTimeline';
import { MessageComposer } from '../room/MessageComposer';
import { CallProvider, VoiceChannel } from '../call';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { useDenKind } from './denKind';

const COLUMN_STYLE: CSSProperties = {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    background: 'var(--bg-surface)',
};

const HEADER_STYLE: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 16px',
    minHeight: 52,
    borderBottom: '1px solid var(--border-default)',
};

const headerButtonStyle = (active: boolean): CSSProperties => ({
    marginLeft: 'auto',
    border: '1px solid var(--border-default)',
    background: active ? 'var(--bg-hover, rgba(255,255,255,0.08))' : 'var(--bg-input)',
    color: 'var(--text-primary)',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 13,
    cursor: 'pointer',
});

const topicStyle: CSSProperties = {
    color: 'var(--text-muted)',
    fontSize: 13,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '50%',
};

const EmptyState = ({ canopy }: { canopy: Room }) => (
    <div style={{ ...COLUMN_STYLE, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }} aria-hidden>
                🗂️
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>{canopy.name}</h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
                Pick a {BLACKOUT_TERMS.den.singular} from the left to start chatting, or add a new
                text or voice channel.
            </p>
        </div>
    </div>
);

const DenHeader = ({
    title,
    topic,
    membersVisible,
    onToggleMembers,
}: {
    title: string;
    topic?: string;
    membersVisible: boolean;
    onToggleMembers: () => void;
}) => (
    <header style={HEADER_STYLE}>
        <strong style={{ fontSize: 15, whiteSpace: 'nowrap' }}>{title}</strong>
        {topic ? <span style={topicStyle}>{topic}</span> : null}
        <button
            type="button"
            onClick={onToggleMembers}
            aria-pressed={membersVisible}
            data-testid="canopy-members-toggle"
            title="Toggle member list"
            style={headerButtonStyle(membersVisible)}
        >
            👥 Members
        </button>
    </header>
);

const getTopic = (room: Room): string | undefined => {
    const content = room.currentState
        .getStateEvents('m.room.topic', '')
        ?.getContent<{ topic?: string }>();
    return typeof content?.topic === 'string' ? content.topic : undefined;
};

/**
 * Main column of the canopy server page. Switches by channel kind: text dens
 * reuse the proven `RoomTimeline` + `MessageComposer`; voice dens reuse the
 * LiveKit `CallProvider` + `VoiceChannel` stack.
 */
export const CanopyDenSurface = ({
    denId,
    canopy,
    membersVisible,
    onToggleMembers,
}: {
    denId: string | null;
    canopy: Room;
    membersVisible: boolean;
    onToggleMembers: () => void;
}) => {
    const mx = useMatrixClient();
    const jumpToEventId = useAtomValue(roomJumpTargetEventIdAtom);
    const kind = useDenKind(denId);

    const room = denId ? mx.getRoom(denId) : null;
    const unreadEventId = useMemo(
        () => (room ? getUnreadMarkerEventId(room, mx.getUserId()) : null),
        [room, mx]
    );

    if (!denId || !room) {
        return <EmptyState canopy={canopy} />;
    }

    if (kind === 'voice') {
        return (
            <div style={COLUMN_STYLE} data-testid="canopy-den-surface" data-den-kind="voice">
                <DenHeader
                    title={room.name}
                    topic={getTopic(room)}
                    membersVisible={membersVisible}
                    onToggleMembers={onToggleMembers}
                />
                <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16 }}>
                    <CallProvider>
                        <VoiceChannel
                            roomId={room.roomId}
                            title={room.name}
                            members={room.getJoinedMembers()}
                            activeRoomId={room.roomId}
                        />
                    </CallProvider>
                </div>
            </div>
        );
    }

    return (
        <div style={COLUMN_STYLE} data-testid="canopy-den-surface" data-den-kind="text">
            <DenHeader
                title={room.name}
                topic={getTopic(room)}
                membersVisible={membersVisible}
                onToggleMembers={onToggleMembers}
            />
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <RoomTimeline
                    roomId={denId}
                    unreadEventId={unreadEventId ?? undefined}
                    jumpToEventId={jumpToEventId ?? undefined}
                />
            </div>
            <MessageComposer roomId={denId} />
        </div>
    );
};

export default CanopyDenSurface;
