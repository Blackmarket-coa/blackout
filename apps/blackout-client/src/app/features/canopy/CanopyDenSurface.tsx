import { type CSSProperties, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { usePowerLevels, readPowerLevel } from '../../hooks/usePowerLevels';
import { roomJumpTargetEventIdAtom } from '../../state/navigation';
import { getUnreadMarkerEventId } from '../right-panel/rightPanelUtils';
import { RoomTimeline } from '../room/RoomTimeline';
import { MessageComposer } from '../room/MessageComposer';
import { CallProvider, VoiceChannel } from '../call';
import { ForumView } from '../forum/ForumView';
import { StageSurface } from './StageSurface';
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
 * Composer for an announcement den: shown only to members with enough power to
 * send messages (announcement dens raise `events_default` to 50). Everyone else
 * gets a read-only notice instead of a dead input. Mounted only on the
 * announcement branch — where `room` is guaranteed non-null — so `usePowerLevels`
 * never runs against a missing room.
 */
const AnnouncementComposerSlot = ({ room, denId }: { room: Room; denId: string }) => {
    const mx = useMatrixClient();
    const powerLevels = usePowerLevels(room);
    const canPost =
        readPowerLevel.user(powerLevels, mx.getUserId() ?? undefined) >=
        readPowerLevel.event(powerLevels, 'm.room.message');

    if (canPost) return <MessageComposer roomId={denId} />;
    return (
        <div
            data-testid="announcement-readonly"
            style={{
                padding: '12px 16px',
                borderTop: '1px solid var(--border-default)',
                color: 'var(--text-muted)',
                fontSize: 13,
                textAlign: 'center',
            }}
        >
            📢 Only moderators can post in this announcement {BLACKOUT_TERMS.den.singular}.
        </div>
    );
};

/**
 * Main column of the canopy server page. Switches by channel kind: text dens
 * reuse the proven `RoomTimeline` + `MessageComposer`; voice and stage dens
 * reuse the LiveKit `CallProvider` stack; announcement dens are read-only for
 * non-moderators; forum dens render the forum view.
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

    if (kind === 'forum') {
        return (
            <div style={COLUMN_STYLE} data-testid="canopy-den-surface" data-den-kind="forum">
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
                    <ForumView roomId={room.roomId} />
                </div>
            </div>
        );
    }

    if (kind === 'stage') {
        return (
            <div style={COLUMN_STYLE} data-testid="canopy-den-surface" data-den-kind="stage">
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
                    <StageSurface room={room} />
                </div>
            </div>
        );
    }

    if (kind === 'announcement') {
        return (
            <div style={COLUMN_STYLE} data-testid="canopy-den-surface" data-den-kind="announcement">
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
                <AnnouncementComposerSlot room={room} denId={denId} />
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
