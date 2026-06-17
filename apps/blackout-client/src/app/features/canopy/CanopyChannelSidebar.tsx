import { type CSSProperties, useMemo, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import { joinedRoomsAtom } from '../../state/rooms';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { mDirectAtom } from '../../state/mDirectList';
import { selectedRoomIdAtom } from '../../state/navigation';
import { createRoomModalAtom } from '../../state/createRoomModal';
import { buildSpaceGroups } from '../right-panel/rightPanelUtils';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { createDenInCanopy, partitionDensByKind, readDenKind } from './denKind';

const SIDEBAR_WIDTH = 248;

const ASIDE_STYLE: CSSProperties = {
    width: SIDEBAR_WIDTH,
    flex: `0 0 ${SIDEBAR_WIDTH}px`,
    borderRight: '1px solid var(--border-default)',
    background: 'var(--bg-nav)',
    color: 'var(--text-primary)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
};

const HEADER_STYLE: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '12px 14px',
    borderBottom: '1px solid var(--border-default)',
    minHeight: 52,
};

const LIST_STYLE: CSSProperties = {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '8px 6px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
};

const groupLabelStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    width: '100%',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted)',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    padding: '6px 8px 2px',
    cursor: 'pointer',
    textAlign: 'left',
};

const channelStyle = (active: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    textAlign: 'left',
    padding: '6px 10px',
    borderRadius: 8,
    border: 'none',
    background: active ? 'var(--bg-hover, rgba(255,255,255,0.08))' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    fontSize: 14,
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
});

const badgeStyle: CSSProperties = {
    marginLeft: 'auto',
    minWidth: 18,
    height: 18,
    padding: '0 5px',
    borderRadius: 999,
    background: 'var(--accent-primary)',
    color: 'var(--bg-surface)',
    fontSize: 11,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const FOOTER_STYLE: CSSProperties = {
    borderTop: '1px solid var(--border-default)',
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
};

const footerButtonStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    textAlign: 'left',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px dashed var(--border-default)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 13,
    cursor: 'pointer',
};

const iconButtonStyle: CSSProperties = {
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    borderRadius: 8,
    width: 30,
    height: 30,
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    fontSize: 14,
};

const unreadCount = (room: Room): number => {
    try {
        return room.getUnreadNotificationCount?.() ?? 0;
    } catch {
        return 0;
    }
};

/**
 * Discord-style channel rail for the open canopy. Reuses the proven
 * `buildSpaceGroups` categorizer (it orders dens by `m.space.child` and nests
 * sub-spaces as category labels) and then splits each category into text and
 * voice channels using the `co.bmc.den.kind` marker.
 */
export const CanopyChannelSidebar = ({
    canopy,
    onOpenSettings,
}: {
    canopy: Room;
    onOpenSettings: () => void;
}) => {
    const mx = useMatrixClient();
    const rooms = useAtomValue(joinedRoomsAtom);
    const roomToParents = useAtomValue(roomToParentsAtom);
    const mDirect = useAtomValue(mDirectAtom);
    const selectedRoomId = useAtomValue(selectedRoomIdAtom);
    const setCreateRoomModal = useSetAtom(createRoomModalAtom);
    const { navigateRoom } = useRoomNavigate();
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [voiceDraft, setVoiceDraft] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const groups = useMemo(
        () =>
            buildSpaceGroups({
                selectedSpaceId: canopy.roomId,
                rooms,
                roomToParents,
                mDirect,
            }),
        [canopy.roomId, rooms, roomToParents, mDirect]
    );

    const toggle = (id: string) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

    const addVoiceDen = async () => {
        const name = (voiceDraft ?? '').trim();
        if (!name || busy) return;
        setBusy(true);
        try {
            const denId = await createDenInCanopy(mx, { canopyId: canopy.roomId, name, kind: 'voice' });
            setVoiceDraft(null);
            navigateRoom(denId);
        } finally {
            setBusy(false);
        }
    };

    return (
        <aside
            data-testid="canopy-channel-sidebar"
            data-shell-region="canopy-channels"
            aria-label={`${canopy.name} channels`}
            style={ASIDE_STYLE}
        >
            <div style={HEADER_STYLE}>
                <strong
                    title={canopy.name}
                    style={{
                        fontSize: 15,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {canopy.name}
                </strong>
                <button
                    type="button"
                    onClick={onOpenSettings}
                    title={`${canopy.name} settings`}
                    aria-label={`${canopy.name} settings`}
                    data-testid="canopy-settings-open"
                    style={iconButtonStyle}
                >
                    ⚙
                </button>
            </div>

            <div style={LIST_STYLE}>
                {groups.map((group) => {
                    const isCollapsed = collapsed[group.id] ?? false;
                    const { text: textRooms, voice: voiceRooms } = partitionDensByKind(group.rooms);
                    const ordered = [...textRooms, ...voiceRooms];
                    return (
                        <section key={group.id}>
                            <button
                                type="button"
                                style={groupLabelStyle}
                                onClick={() => toggle(group.id)}
                                aria-expanded={!isCollapsed}
                            >
                                <span aria-hidden>{isCollapsed ? '▶' : '▼'}</span>
                                <span
                                    style={{
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {group.label}
                                </span>
                            </button>
                            {isCollapsed ? null : ordered.length === 0 ? (
                                <small style={{ color: 'var(--text-muted)', padding: '2px 12px' }}>
                                    No {BLACKOUT_TERMS.den.plural}
                                </small>
                            ) : (
                                ordered.map((room) => {
                                    const active = selectedRoomId === room.roomId;
                                    const kind = readDenKind(room);
                                    const unread = unreadCount(room);
                                    return (
                                        <button
                                            key={room.roomId}
                                            type="button"
                                            onClick={() => navigateRoom(room.roomId)}
                                            aria-current={active ? 'page' : undefined}
                                            data-testid={`canopy-channel-${room.roomId}`}
                                            data-den-kind={kind}
                                            style={channelStyle(active)}
                                        >
                                            <span aria-hidden>{kind === 'voice' ? '🔊' : '💬'}</span>
                                            <span
                                                style={{
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {room.name}
                                            </span>
                                            {unread > 0 ? (
                                                <span style={badgeStyle}>{unread > 99 ? '99+' : unread}</span>
                                            ) : null}
                                        </button>
                                    );
                                })
                            )}
                        </section>
                    );
                })}
            </div>

            <div style={FOOTER_STYLE}>
                <button
                    type="button"
                    style={footerButtonStyle}
                    data-testid="canopy-add-text-den"
                    onClick={() => setCreateRoomModal({ spaceId: canopy.roomId })}
                >
                    <span aria-hidden>＋</span>
                    <span>Add text {BLACKOUT_TERMS.den.singular}</span>
                </button>
                {voiceDraft === null ? (
                    <button
                        type="button"
                        style={footerButtonStyle}
                        data-testid="canopy-add-voice-den"
                        onClick={() => setVoiceDraft('')}
                    >
                        <span aria-hidden>🔊</span>
                        <span>Add voice {BLACKOUT_TERMS.den.singular}</span>
                    </button>
                ) : (
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            void addVoiceDen();
                        }}
                        style={{ display: 'flex', gap: 6 }}
                    >
                        <input
                            autoFocus
                            value={voiceDraft}
                            onChange={(event) => setVoiceDraft(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Escape') setVoiceDraft(null);
                            }}
                            placeholder="Voice channel name"
                            aria-label="Voice channel name"
                            data-testid="canopy-voice-name"
                            style={{
                                flex: 1,
                                minWidth: 0,
                                border: '1px solid var(--border-default)',
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                borderRadius: 8,
                                padding: '6px 8px',
                                fontSize: 13,
                            }}
                        />
                        <button
                            type="submit"
                            disabled={busy || voiceDraft.trim().length === 0}
                            style={{ ...iconButtonStyle, width: 'auto', padding: '0 10px' }}
                        >
                            {busy ? '…' : 'Add'}
                        </button>
                    </form>
                )}
            </div>
        </aside>
    );
};

export default CanopyChannelSidebar;
