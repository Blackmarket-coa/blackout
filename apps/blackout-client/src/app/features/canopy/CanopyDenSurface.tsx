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

export type RightDock = 'members' | 'threads' | 'pins' | null;

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
    gap: 8,
    padding: '0 12px',
    minHeight: 52,
    borderBottom: '1px solid var(--border-default)',
};

const toggleStyle = (active: boolean): CSSProperties => ({
    border: '1px solid var(--border-default)',
    background: active ? 'var(--bg-hover, rgba(255,255,255,0.08))' : 'var(--bg-input)',
    color: 'var(--text-primary)',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 13,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
});

const iconToggleStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    borderRadius: 8,
    width: 32,
    height: 32,
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    fontSize: 15,
    flex: '0 0 auto',
};

const topicStyle: CSSProperties = {
    color: 'var(--text-muted)',
    fontSize: 13,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '40%',
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

interface DenHeaderProps {
    title: string;
    topic?: string;
    rightDock: RightDock;
    showThreads: boolean;
    showPins: boolean;
    compact: boolean;
    onOpenChannels: () => void;
    onToggleMembers: () => void;
    onToggleThreads: () => void;
    onTogglePins: () => void;
}

const DenHeader = ({
    title,
    topic,
    rightDock,
    showThreads,
    showPins,
    compact,
    onOpenChannels,
    onToggleMembers,
    onToggleThreads,
    onTogglePins,
}: DenHeaderProps) => (
    <header style={HEADER_STYLE}>
        {compact ? (
            <button
                type="button"
                onClick={onOpenChannels}
                aria-label="Show channels"
                title="Show channels"
                data-testid="canopy-open-channels"
                style={iconToggleStyle}
            >
                ☰
            </button>
        ) : null}
        <strong style={{ fontSize: 15, whiteSpace: 'nowrap' }}>{title}</strong>
        {topic && !compact ? <span style={topicStyle}>{topic}</span> : null}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {showPins ? (
                <button
                    type="button"
                    onClick={onTogglePins}
                    aria-pressed={rightDock === 'pins'}
                    data-testid="canopy-pins-toggle"
                    title="Toggle pinned messages"
                    style={toggleStyle(rightDock === 'pins')}
                >
                    📌{compact ? '' : ' Pins'}
                </button>
            ) : null}
            {showThreads ? (
                <button
                    type="button"
                    onClick={onToggleThreads}
                    aria-pressed={rightDock === 'threads'}
                    data-testid="canopy-threads-toggle"
                    title="Toggle threads"
                    style={toggleStyle(rightDock === 'threads')}
                >
                    🧵{compact ? '' : ' Threads'}
                </button>
            ) : null}
            <button
                type="button"
                onClick={onToggleMembers}
                aria-pressed={rightDock === 'members'}
                data-testid="canopy-members-toggle"
                title="Toggle member list"
                style={toggleStyle(rightDock === 'members')}
            >
                👥{compact ? '' : ' Members'}
            </button>
        </div>
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
    rightDock,
    compact,
    onOpenChannels,
    onToggleMembers,
    onToggleThreads,
    onTogglePins,
}: {
    denId: string | null;
    canopy: Room;
    rightDock: RightDock;
    compact: boolean;
    onOpenChannels: () => void;
    onToggleMembers: () => void;
    onToggleThreads: () => void;
    onTogglePins: () => void;
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
                    rightDock={rightDock}
                    showThreads={false}
                    showPins={false}
                    compact={compact}
                    onOpenChannels={onOpenChannels}
                    onToggleMembers={onToggleMembers}
                    onToggleThreads={onToggleThreads}
                    onTogglePins={onTogglePins}
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
                rightDock={rightDock}
                showThreads
                showPins
                compact={compact}
                onOpenChannels={onOpenChannels}
                onToggleMembers={onToggleMembers}
                onToggleThreads={onToggleThreads}
                onTogglePins={onTogglePins}
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
