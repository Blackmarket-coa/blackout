import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { MatrixClient, Room } from 'matrix-js-sdk';
import {
    draggable,
    dropTargetForElements,
    monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import {
    attachClosestEdge,
    extractClosestEdge,
    type Edge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { joinedRoomsAtom } from '../../state/rooms';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { mDirectAtom } from '../../state/mDirectList';
import { selectedRoomIdAtom } from '../../state/navigation';
import { createRoomModalAtom } from '../../state/createRoomModal';
import { buildSpaceGroups } from '../right-panel/rightPanelUtils';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useConfirm, type ConfirmOptions } from '../../components/confirm-dialog';
import { readPowerLevel, usePowerLevels } from '../../hooks/usePowerLevels';
import { StateEvent } from '../../../types/matrix/room';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { FORUM_EVENT_TYPE } from '../forum/useForum';
import { ForumSettingsDialog } from '../forum/ForumSettingsDialog';
import {
    type DenKind,
    createDenInCanopy,
    partitionDensByKind,
    readDenKind,
    removeDenFromCanopy,
    renameDen,
} from './denKind';
import { computeBucketReorder, reorderDenInCanopy } from './denOrder';

// Drag payload shared between a den row (draggable) and the rail-level monitor.
// A drop is only honoured between dens of the same parent space and kind bucket.
type DenDragData = {
    type: 'canopy-den';
    roomId: string;
    parentId: string;
    kind: DenKind;
};

const isDenDragData = (data: Record<string, unknown>): data is DenDragData =>
    data.type === 'canopy-den';

const readChildContent = (parent: Room, denId: string): Record<string, unknown> => {
    const content = parent.currentState
        .getStateEvents('m.space.child', denId)
        ?.getContent<Record<string, unknown>>();
    return content && typeof content === 'object' ? content : {};
};

/**
 * Build the confirm-dialog options for deleting a den. Extracted so the
 * destructive-action wiring (delete only runs via `onConfirm`) is unit-testable
 * without rendering the whole sidebar.
 */
export const buildDeleteDenConfirm = (
    mx: MatrixClient,
    {
        canopyId,
        canopyName,
        denId,
        denName,
    }: {
        canopyId: string;
        canopyName: string;
        denId: string;
        denName: string;
    }
): ConfirmOptions => ({
    title: `Delete ${denName}?`,
    description: `This removes ${denName} from ${canopyName} and you’ll leave the channel. This can’t be undone.`,
    confirmLabel: 'Delete',
    variant: 'Critical',
    onConfirm: () => removeDenFromCanopy(mx, { canopyId, denId }),
});

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

const rowWrapStyle: CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
};

const menuTriggerStyle: CSSProperties = {
    position: 'absolute',
    right: 4,
    top: '50%',
    transform: 'translateY(-50%)',
    border: 'none',
    background: 'var(--bg-nav)',
    color: 'var(--text-muted)',
    borderRadius: 6,
    width: 22,
    height: 22,
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
};

const popoverStyle: CSSProperties = {
    position: 'absolute',
    right: 4,
    top: 'calc(100% - 2px)',
    zIndex: 5,
    minWidth: 140,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
    padding: 4,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
};

const menuItemStyle = (danger = false): CSSProperties => ({
    border: 'none',
    background: 'transparent',
    color: danger ? 'var(--danger, #f04747)' : 'var(--text-primary)',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 13,
    textAlign: 'left',
    cursor: 'pointer',
});

/**
 * Single den row in the channel rail. Owns its own rename/delete menu so the
 * per-room rename power check (`usePowerLevels(room)`) stays out of the parent
 * loop. Delete power is canopy-level (the `m.space.child` edge lives on the
 * canopy) and is passed down as `canManage`.
 */
const DenRow = ({
    room,
    parentId,
    active,
    canManage,
    myId,
    onSelect,
    onDeleted,
}: {
    room: Room;
    parentId: string;
    active: boolean;
    canManage: boolean;
    myId: string | undefined;
    onSelect: () => void;
    onDeleted: (denId: string) => void;
}) => {
    const mx = useMatrixClient();
    const powerLevels = usePowerLevels(room);
    const [menuOpen, setMenuOpen] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [draft, setDraft] = useState(room.name ?? '');
    const [busy, setBusy] = useState(false);
    const [forumSettingsOpen, setForumSettingsOpen] = useState(false);
    const rowRef = useRef<HTMLDivElement>(null);
    const [dropEdge, setDropEdge] = useState<Edge | null>(null);

    const kind = readDenKind(room);
    const unread = unreadCount(room);
    const canRename =
        readPowerLevel.user(powerLevels, myId) >=
        readPowerLevel.state(powerLevels, StateEvent.RoomName);
    // Forum settings live in the den's own `co.bmc.forum` state event.
    const canEditForum =
        kind === 'forum' &&
        readPowerLevel.user(powerLevels, myId) >=
            readPowerLevel.state(powerLevels, FORUM_EVENT_TYPE);
    const showMenu = canRename || canManage || canEditForum;

    // Drag-to-reorder: a den is both draggable and a drop target when the viewer
    // can edit the parent's `m.space.child`. Drops are constrained to the same
    // parent + kind bucket; the rail-level monitor performs the reorder.
    useEffect(() => {
        const element = rowRef.current;
        if (!element || !canManage) return undefined;
        const payload: DenDragData = { type: 'canopy-den', roomId: room.roomId, parentId, kind };
        return combine(
            draggable({
                element,
                getInitialData: () => payload,
            }),
            dropTargetForElements({
                element,
                canDrop: ({ source }) =>
                    isDenDragData(source.data) &&
                    source.data.parentId === parentId &&
                    source.data.kind === kind,
                getData: ({ input }) =>
                    attachClosestEdge(payload, {
                        element,
                        input,
                        allowedEdges: ['top', 'bottom'],
                    }),
                onDrag: ({ self, source }) => {
                    if (source.element === element) {
                        setDropEdge(null);
                        return;
                    }
                    setDropEdge(extractClosestEdge(self.data));
                },
                onDragLeave: () => setDropEdge(null),
                onDrop: () => setDropEdge(null),
            })
        );
    }, [canManage, parentId, kind, room.roomId]);

    const closeMenu = () => setMenuOpen(false);

    const submitRename = async () => {
        const name = draft.trim();
        if (!name || busy) return;
        setBusy(true);
        try {
            await renameDen(mx, { denId: room.roomId, name });
            setRenaming(false);
            closeMenu();
        } finally {
            setBusy(false);
        }
    };

    if (renaming) {
        return (
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    void submitRename();
                }}
                style={{ display: 'flex', gap: 6, padding: '2px 6px' }}
            >
                <input
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                            setRenaming(false);
                            setDraft(room.name ?? '');
                        }
                    }}
                    aria-label={`Rename ${room.name}`}
                    data-testid={`canopy-den-rename-input-${room.roomId}`}
                    style={{
                        flex: 1,
                        minWidth: 0,
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        borderRadius: 8,
                        padding: '5px 8px',
                        fontSize: 13,
                    }}
                />
                <button
                    type="submit"
                    disabled={busy || draft.trim().length === 0}
                    style={{ ...menuItemStyle(), border: '1px solid var(--border-default)' }}
                >
                    {busy ? '…' : 'Save'}
                </button>
            </form>
        );
    }

    return (
        <div
            ref={rowRef}
            style={{ ...rowWrapStyle, cursor: canManage ? 'grab' : undefined }}
            onContextMenu={
                showMenu
                    ? (event) => {
                          event.preventDefault();
                          setMenuOpen(true);
                      }
                    : undefined
            }
        >
            {dropEdge ? (
                <span
                    aria-hidden
                    data-testid={`canopy-den-drop-${dropEdge}`}
                    style={{
                        position: 'absolute',
                        left: 4,
                        right: 4,
                        height: 2,
                        background: 'var(--accent-primary)',
                        borderRadius: 2,
                        ...(dropEdge === 'top' ? { top: -3 } : { bottom: -3 }),
                    }}
                />
            ) : null}
            <button
                type="button"
                onClick={onSelect}
                aria-current={active ? 'page' : undefined}
                data-testid={`canopy-channel-${room.roomId}`}
                data-den-kind={kind}
                style={{ ...channelStyle(active), paddingRight: showMenu ? 30 : 10 }}
            >
                <span aria-hidden>{kind === 'voice' ? '🔊' : kind === 'forum' ? '📋' : '💬'}</span>
                <span
                    style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {room.name}
                </span>
                {unread > 0 ? <span style={badgeStyle}>{unread > 99 ? '99+' : unread}</span> : null}
            </button>

            {showMenu ? (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        setMenuOpen((open) => !open);
                    }}
                    aria-label={`${room.name} options`}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    data-testid={`canopy-den-menu-${room.roomId}`}
                    style={menuTriggerStyle}
                >
                    ⋯
                </button>
            ) : null}

            {menuOpen ? (
                <>
                    <div
                        onClick={closeMenu}
                        style={{ position: 'fixed', inset: 0, zIndex: 4 }}
                        aria-hidden
                    />
                    <div role="menu" style={popoverStyle}>
                        {canRename ? (
                            <button
                                type="button"
                                role="menuitem"
                                style={menuItemStyle()}
                                data-testid={`canopy-den-rename-${room.roomId}`}
                                onClick={() => {
                                    setDraft(room.name ?? '');
                                    setRenaming(true);
                                    closeMenu();
                                }}
                            >
                                Rename
                            </button>
                        ) : null}
                        {canEditForum ? (
                            <button
                                type="button"
                                role="menuitem"
                                style={menuItemStyle()}
                                data-testid={`canopy-den-forum-settings-${room.roomId}`}
                                onClick={() => {
                                    setForumSettingsOpen(true);
                                    closeMenu();
                                }}
                            >
                                Forum settings
                            </button>
                        ) : null}
                        {canManage ? (
                            <button
                                type="button"
                                role="menuitem"
                                style={menuItemStyle(true)}
                                disabled={busy}
                                data-testid={`canopy-den-delete-${room.roomId}`}
                                onClick={() => {
                                    closeMenu();
                                    onDeleted(room.roomId);
                                }}
                            >
                                Delete
                            </button>
                        ) : null}
                    </div>
                </>
            ) : null}

            {forumSettingsOpen ? (
                <ForumSettingsDialog
                    roomId={room.roomId}
                    onClose={() => setForumSettingsOpen(false)}
                />
            ) : null}
        </div>
    );
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
    onNavigate,
}: {
    canopy: Room;
    onOpenSettings: () => void;
    onNavigate?: () => void;
}) => {
    const mx = useMatrixClient();
    const rooms = useAtomValue(joinedRoomsAtom);
    const roomToParents = useAtomValue(roomToParentsAtom);
    const mDirect = useAtomValue(mDirectAtom);
    const selectedRoomId = useAtomValue(selectedRoomIdAtom);
    const setCreateRoomModal = useSetAtom(createRoomModalAtom);
    const { navigateRoom } = useRoomNavigate();
    const confirm = useConfirm();
    const canopyPowerLevels = usePowerLevels(canopy);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [voiceDraft, setVoiceDraft] = useState<string | null>(null);
    const [forumDraft, setForumDraft] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const myId = mx.getUserId() ?? undefined;
    // Removing a den clears the `m.space.child` edge on the canopy, so the
    // delete affordance is gated on canopy-level (not den-level) power.
    const canManageChildren =
        readPowerLevel.user(canopyPowerLevels, myId) >=
        readPowerLevel.state(canopyPowerLevels, StateEvent.SpaceChild);

    const deleteDen = async (denId: string) => {
        const denName = mx.getRoom(denId)?.name ?? `this ${BLACKOUT_TERMS.den.singular}`;
        const confirmed = await confirm(
            buildDeleteDenConfirm(mx, {
                canopyId: canopy.roomId,
                canopyName: canopy.name,
                denId,
                denName,
            })
        );
        if (confirmed && selectedRoomId === denId) {
            navigateRoom(canopy.roomId);
            onNavigate?.();
        }
    };

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

    // A group's dens live on the canopy itself (the synthetic "general" group)
    // or on the category sub-space (group.id is its roomId).
    const parentIdForGroup = (groupId: string) => (groupId === 'general' ? canopy.roomId : groupId);

    const onReorder = useCallback(
        (source: DenDragData, targetRoomId: string, edge: Edge | null) => {
            if (!canManageChildren || source.roomId === targetRoomId) return;
            const parent = mx.getRoom(source.parentId);
            if (!parent) return;
            const group = groups.find(
                (entry) => (entry.id === 'general' ? canopy.roomId : entry.id) === source.parentId
            );
            if (!group) return;

            const { text, voice, forum } = partitionDensByKind(group.rooms);
            const bucketRooms =
                source.kind === 'voice' ? voice : source.kind === 'forum' ? forum : text;
            const contentByDenId: Record<string, Record<string, unknown>> = {};
            const bucket = bucketRooms.map((entry) => {
                const content = readChildContent(parent, entry.roomId);
                contentByDenId[entry.roomId] = content;
                return {
                    roomId: entry.roomId,
                    order: typeof content.order === 'string' ? content.order : undefined,
                };
            });

            const fromIndex = bucket.findIndex((entry) => entry.roomId === source.roomId);
            const targetIndex = bucket.findIndex((entry) => entry.roomId === targetRoomId);
            if (fromIndex < 0 || targetIndex < 0) return;

            const insertBefore = edge === 'bottom' ? targetIndex + 1 : targetIndex;
            const toIndex = insertBefore > fromIndex ? insertBefore - 1 : insertBefore;
            const changes = computeBucketReorder(bucket, fromIndex, toIndex);
            if (changes.length === 0) return;
            void reorderDenInCanopy(mx, { parentId: source.parentId, changes, contentByDenId });
        },
        [canManageChildren, groups, mx, canopy.roomId]
    );

    useEffect(() => {
        const scrollEl = scrollRef.current;
        if (!scrollEl || !canManageChildren) return undefined;
        return combine(
            monitorForElements({
                canMonitor: ({ source }) => isDenDragData(source.data),
                onDrop: ({ source, location }) => {
                    const target = location.current.dropTargets[0];
                    if (!target || !isDenDragData(source.data) || !isDenDragData(target.data)) {
                        return;
                    }
                    onReorder(source.data, target.data.roomId, extractClosestEdge(target.data));
                },
            }),
            autoScrollForElements({ element: scrollEl })
        );
    }, [canManageChildren, onReorder]);

    const toggle = (id: string) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

    const addVoiceDen = async () => {
        const name = (voiceDraft ?? '').trim();
        if (!name || busy) return;
        setBusy(true);
        try {
            const denId = await createDenInCanopy(mx, {
                canopyId: canopy.roomId,
                name,
                kind: 'voice',
            });
            setVoiceDraft(null);
            navigateRoom(denId);
            onNavigate?.();
        } finally {
            setBusy(false);
        }
    };

    const addForumDen = async () => {
        const name = (forumDraft ?? '').trim();
        if (!name || busy) return;
        setBusy(true);
        try {
            const denId = await createDenInCanopy(mx, {
                canopyId: canopy.roomId,
                name,
                kind: 'forum',
            });
            setForumDraft(null);
            navigateRoom(denId);
            onNavigate?.();
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

            <div style={LIST_STYLE} ref={scrollRef}>
                {groups.map((group) => {
                    const isCollapsed = collapsed[group.id] ?? false;
                    const {
                        text: textRooms,
                        voice: voiceRooms,
                        forum: forumRooms,
                    } = partitionDensByKind(group.rooms);
                    const ordered = [...textRooms, ...voiceRooms, ...forumRooms];
                    const groupParentId = parentIdForGroup(group.id);
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
                                ordered.map((room) => (
                                    <DenRow
                                        key={room.roomId}
                                        room={room}
                                        parentId={groupParentId}
                                        active={selectedRoomId === room.roomId}
                                        canManage={canManageChildren}
                                        myId={myId}
                                        onSelect={() => {
                                            navigateRoom(room.roomId);
                                            onNavigate?.();
                                        }}
                                        onDeleted={deleteDen}
                                    />
                                ))
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
                {forumDraft === null ? (
                    <button
                        type="button"
                        style={footerButtonStyle}
                        data-testid="canopy-add-forum-den"
                        onClick={() => setForumDraft('')}
                    >
                        <span aria-hidden>📋</span>
                        <span>Add forum {BLACKOUT_TERMS.den.singular}</span>
                    </button>
                ) : (
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            void addForumDen();
                        }}
                        style={{ display: 'flex', gap: 6 }}
                    >
                        <input
                            autoFocus
                            value={forumDraft}
                            onChange={(event) => setForumDraft(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Escape') setForumDraft(null);
                            }}
                            placeholder="Forum channel name"
                            aria-label="Forum channel name"
                            data-testid="canopy-forum-name"
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
                            disabled={busy || forumDraft.trim().length === 0}
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
