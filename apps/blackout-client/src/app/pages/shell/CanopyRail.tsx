import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEventHandler,
    type MutableRefObject,
} from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { Link, useLocation, useNavigate } from 'react-router';
import type { MatrixClient, Room } from 'matrix-js-sdk';
import {
    draggable,
    dropTargetForElements,
    monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { joinedRoomsAtom } from '../../state/rooms';
import { selectedRoomIdAtom, selectedSpaceIdAtom } from '../../state/navigation';
import { createSpaceModalAtom } from '../../state/createSpaceModal';
import { canopyUnreadsAtom, type CanopyUnread } from '../../state/canopyUnreads';
import {
    canopyRailLayoutAtom,
    combineIntoFolder,
    moveByOffset,
    moveEntry,
    normalizeLayout,
    railEntries,
    saveCanopyRailLayout,
    toggleFolderCollapsed,
    type CanopyLayoutFolder,
    type CanopyRailLayout,
} from '../../state/canopyLayout';
import { BLACKOUT_GLOSSARY, BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { RegistrySidebarList } from '../../core/features/RegistrySidebarList';
import { ThreadUnreadBadgeMount } from '../../features/auth-threads';
import type { ShellPanelEntry } from '../../core/features/types';
import { useMatrixClientOrNull } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useReducedMotion } from '../../features/home/useReducedMotion';
import { mxcUrlToHttp } from '../../utils/matrix';
import { CANOPIES_PATH, ROOT_PATH, buildCommunitiesPath } from '../paths';
import { isShellPathActive } from './modeRouter';
import * as css from './CanopyRail.css';

/**
 * Sidebar registry entries already surfaced by the global top nav
 * (PrimaryNavBar) or by the canopy list itself — excluded from the rail's
 * registry section so they are never duplicated in the chrome.
 */
const PRIMARY_SIDEBAR_PANEL_IDS = new Set<string>([
    'home.sidebar',
    'streaming.sidebar',
    'coalition.sidebar',
    'coliseum.sidebar',
    'communities.sidebar',
]);

const NO_UNREAD: CanopyUnread = { total: 0, mentions: 0 };

const initials = (name: string) => name.slice(0, 2).toUpperCase();

/** Drag payload shared by every rail row and the rail-level drop monitor. */
type RailDragData = {
    type: 'canopy-rail-item';
    /** canopyId or folder id. */
    key: string;
    itemKind: 'canopy' | 'folder';
    /** Set when the dragged canopy currently lives inside a folder. */
    fromFolderId?: string;
};

const isRailDragData = (data: Record<string, unknown>): data is RailDragData =>
    data.type === 'canopy-rail-item';

type DropRegion = 'top' | 'bottom' | 'combine';

/**
 * Splits a hovered row into top / combine / bottom zones. Rows that can't
 * absorb a drop (folder members) collapse the center zone into plain edges.
 */
const computeRegion = (
    element: HTMLElement,
    clientY: number,
    allowCombine: boolean
): DropRegion => {
    const rect = element.getBoundingClientRect();
    const y = clientY - rect.top;
    if (!allowCombine) return y < rect.height / 2 ? 'top' : 'bottom';
    if (y < rect.height * 0.3) return 'top';
    if (y > rect.height * 0.7) return 'bottom';
    return 'combine';
};

/** Folders never nest or merge, so a folder source degrades combine to an edge. */
const resolveRegion = (region: DropRegion | undefined, source: RailDragData): DropRegion =>
    region === 'combine' && source.itemKind === 'folder' ? 'bottom' : region ?? 'bottom';

type RailRowDnd = {
    key: string;
    itemKind: 'canopy' | 'folder';
    fromFolderId?: string;
    allowCombine: boolean;
};

/** Wires a rail row as a draggable + drop target; returns visual drag state. */
const useRailRowDnd = (
    ref: MutableRefObject<HTMLButtonElement | null>,
    { key, itemKind, fromFolderId, allowCombine }: RailRowDnd
) => {
    const [dropRegion, setDropRegion] = useState<DropRegion | null>(null);
    const [dragging, setDragging] = useState(false);

    useEffect(() => {
        const element = ref.current;
        if (!element) return undefined;
        const payload: RailDragData = { type: 'canopy-rail-item', key, itemKind, fromFolderId };
        return combine(
            draggable({
                element,
                getInitialData: () => ({ ...payload }),
                onDragStart: () => setDragging(true),
                onDrop: () => setDragging(false),
            }),
            dropTargetForElements({
                element,
                canDrop: ({ source }) =>
                    isRailDragData(source.data) &&
                    source.data.key !== key &&
                    // A folder can't be dropped between the members of a folder.
                    !(source.data.itemKind === 'folder' && Boolean(fromFolderId)),
                getData: ({ input }) => ({
                    ...payload,
                    dropRegion: computeRegion(element, input.clientY, allowCombine),
                    targetFolderId: fromFolderId,
                }),
                onDrag: ({ self, source }) => {
                    if (source.element === element) {
                        setDropRegion(null);
                        return;
                    }
                    if (!isRailDragData(source.data)) return;
                    setDropRegion(
                        resolveRegion(
                            (self.data as { dropRegion?: DropRegion }).dropRegion,
                            source.data
                        )
                    );
                },
                onDragLeave: () => setDropRegion(null),
                onDrop: () => setDropRegion(null),
            })
        );
    }, [ref, key, itemKind, fromFolderId, allowCombine]);

    return { dropRegion, dragging };
};

const DropIndicators = ({ region }: { region: DropRegion | null }) => (
    <>
        {region === 'top' ? <span className={css.dropLineTop} aria-hidden /> : null}
        {region === 'bottom' ? <span className={css.dropLineBottom} aria-hidden /> : null}
    </>
);

type CanopyTileProps = {
    room: Room;
    active: boolean;
    unread: CanopyUnread;
    mx: MatrixClient | null;
    useAuthentication: boolean;
    tabIndex: number;
    onOpen: (spaceId: string) => void;
    onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
    itemsRef: MutableRefObject<Array<HTMLButtonElement | null>>;
    index: number;
    fromFolderId?: string;
};

const CanopyTile = ({
    room,
    active,
    unread,
    mx,
    useAuthentication,
    tabIndex,
    onOpen,
    onKeyDown,
    itemsRef,
    index,
    fromFolderId,
}: CanopyTileProps) => {
    const name = room.name || room.roomId;
    const [imgFailed, setImgFailed] = useState(false);
    const btnRef = useRef<HTMLButtonElement | null>(null);
    // Rows inside a folder only reorder; top-level rows also accept
    // center-drops that form (or grow) folders.
    const { dropRegion, dragging } = useRailRowDnd(btnRef, {
        key: room.roomId,
        itemKind: 'canopy',
        fromFolderId,
        allowCombine: !fromFolderId,
    });
    // `getMxcAvatarUrl` is optional-chained: shell tests render rooms as
    // 6-method stubs, and the rail must never require a Matrix client.
    const avatarSrc = useMemo(() => {
        const mxc = room.getMxcAvatarUrl?.();
        if (!mxc || !mx) return undefined;
        return mxcUrlToHttp(mx, mxc, useAuthentication, 96, 96, 'crop') ?? undefined;
    }, [room, mx, useAuthentication]);

    const pillState = active ? 'active' : unread.total > 0 ? 'unread' : 'none';
    const mentions = unread.mentions;

    return (
        <div className={css.tileRow}>
            <span className={css.pill} data-state={pillState} aria-hidden />
            <DropIndicators region={dropRegion} />
            <button
                ref={(el) => {
                    btnRef.current = el;
                    itemsRef.current[index] = el;
                }}
                type="button"
                className={css.tile}
                onClick={() => onOpen(room.roomId)}
                onKeyDown={onKeyDown}
                tabIndex={tabIndex}
                aria-label={name}
                title={name}
                aria-current={active ? 'page' : undefined}
                data-combine={dropRegion === 'combine' ? 'true' : undefined}
                data-dragging={dragging ? 'true' : undefined}
                data-testid={`canopy-sidebar-item-${room.roomId}`}
            >
                {avatarSrc && !imgFailed ? (
                    <img
                        className={css.tileImg}
                        src={avatarSrc}
                        alt=""
                        onError={() => setImgFailed(true)}
                    />
                ) : (
                    <span aria-hidden>{initials(name)}</span>
                )}
                {mentions > 0 ? (
                    <span
                        className={css.mentionBadge}
                        role="status"
                        aria-label={`${mentions} mention${mentions === 1 ? '' : 's'}`}
                        data-testid={`canopy-rail-badge-${room.roomId}`}
                    >
                        {mentions > 99 ? '99+' : mentions}
                    </span>
                ) : null}
            </button>
        </div>
    );
};

type FolderTileProps = {
    folder: CanopyLayoutFolder;
    rooms: Room[];
    containsActive: boolean;
    unread: CanopyUnread;
    tabIndex: number;
    onToggle: (folderId: string) => void;
    onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
    itemsRef: MutableRefObject<Array<HTMLButtonElement | null>>;
    index: number;
};

const FolderTile = ({
    folder,
    rooms,
    containsActive,
    unread,
    tabIndex,
    onToggle,
    onKeyDown,
    itemsRef,
    index,
}: FolderTileProps) => {
    const btnRef = useRef<HTMLButtonElement | null>(null);
    const { dropRegion, dragging } = useRailRowDnd(btnRef, {
        key: folder.id,
        itemKind: 'folder',
        allowCombine: true,
    });
    const collapsed = folder.collapsed === true;
    const label =
        folder.name ??
        `Folder of ${rooms.length} ${
            rooms.length === 1 ? BLACKOUT_TERMS.canopy.singular : BLACKOUT_TERMS.canopy.plural
        }`;
    // When expanded, the members render their own pills/badges right below —
    // the rollup only shows on the collapsed tile.
    const pillState = collapsed
        ? containsActive
            ? 'active'
            : unread.total > 0
            ? 'unread'
            : 'none'
        : 'none';
    const mentions = collapsed ? unread.mentions : 0;

    return (
        <div className={css.tileRow}>
            <span className={css.pill} data-state={pillState} aria-hidden />
            <DropIndicators region={dropRegion} />
            <button
                ref={(el) => {
                    btnRef.current = el;
                    itemsRef.current[index] = el;
                }}
                type="button"
                className={css.tile}
                onClick={() => onToggle(folder.id)}
                onKeyDown={onKeyDown}
                tabIndex={tabIndex}
                aria-label={label}
                title={label}
                aria-expanded={!collapsed}
                data-combine={dropRegion === 'combine' ? 'true' : undefined}
                data-dragging={dragging ? 'true' : undefined}
                data-testid={`canopy-rail-folder-${folder.id}`}
            >
                <span className={css.folderChipGrid} aria-hidden>
                    {rooms.slice(0, 4).map((room) => (
                        <span key={room.roomId} className={css.folderChip}>
                            {(room.name || room.roomId).charAt(0).toUpperCase()}
                        </span>
                    ))}
                </span>
                {mentions > 0 ? (
                    <span
                        className={css.mentionBadge}
                        role="status"
                        aria-label={`${mentions} mention${mentions === 1 ? '' : 's'}`}
                        data-testid={`canopy-rail-badge-${folder.id}`}
                    >
                        {mentions > 99 ? '99+' : mentions}
                    </span>
                ) : null}
            </button>
        </div>
    );
};

/** Flat, focusable row model backing roving-tabindex keyboard navigation. */
type RailRow =
    | { rowKind: 'canopy'; key: string; fromFolderId?: string }
    | { rowKind: 'folder'; key: string };

/**
 * Discord-style canopy rail: the vertical strip of canopy (space) icons the
 * AppShell renders on every desktop page, and which `CanopyServerPage`
 * composes into its compact left drawer (`variant="drawer"`) so mobile users
 * can switch canopies without leaving the chat shell.
 *
 * Tiles follow the user's persisted layout (order + folders, synced through
 * `co.bmc.canopy_rail_layout` account data). Drag a tile to reorder; drop a
 * canopy onto another's center to form a folder, onto a folder to file it
 * there; Alt+Arrow moves the focused row without a pointer. Selecting a
 * canopy mirrors the old `CanopySidebar.openSpace` contract: set the
 * selection atoms eagerly (no stale-den flash), then navigate to the
 * canonical `/communities/:canopyId` route — `CommunitiesRoute` remains the
 * single param→atom writer for deep links.
 */
export const CanopyRail = ({ variant = 'shell' }: { variant?: 'shell' | 'drawer' }) => {
    const rooms = useAtomValue(joinedRoomsAtom);
    const selectedSpaceId = useAtomValue(selectedSpaceIdAtom);
    const setSelectedSpaceId = useSetAtom(selectedSpaceIdAtom);
    const setSelectedRoomId = useSetAtom(selectedRoomIdAtom);
    const setCreateSpaceModal = useSetAtom(createSpaceModalAtom);
    const canopyUnreads = useAtomValue(canopyUnreadsAtom);
    const storedLayout = useAtomValue(canopyRailLayoutAtom);
    const setStoredLayout = useSetAtom(canopyRailLayoutAtom);
    const mx = useMatrixClientOrNull();
    const useAuthentication = useMediaAuthentication();
    const reducedMotion = useReducedMotion();
    const navigate = useNavigate();
    const location = useLocation();
    const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);

    const canopies = useMemo(() => rooms.filter((room) => room.getType() === 'm.space'), [rooms]);

    // Mutations operate on the normalized (fully materialized) layout so the
    // very first drag produces an explicit total order even when nothing was
    // ever persisted.
    const layout = useMemo(
        () =>
            normalizeLayout(
                storedLayout,
                canopies.map((room) => room.roomId)
            ),
        [storedLayout, canopies]
    );
    const entries = useMemo(() => railEntries(canopies, layout), [canopies, layout]);

    const rows = useMemo<RailRow[]>(
        () =>
            entries.flatMap<RailRow>((entry) => {
                if (entry.kind === 'canopy') {
                    return [{ rowKind: 'canopy', key: entry.room.roomId }];
                }
                const folderRow: RailRow = { rowKind: 'folder', key: entry.folder.id };
                if (entry.folder.collapsed) return [folderRow];
                return [
                    folderRow,
                    ...entry.rooms.map<RailRow>((room) => ({
                        rowKind: 'canopy',
                        key: room.roomId,
                        fromFolderId: entry.folder.id,
                    })),
                ];
            }),
        [entries]
    );
    const rowIndexByKey = useMemo(
        () => new Map(rows.map((row, index) => [row.key, index])),
        [rows]
    );

    const commitLayout = (next: CanopyRailLayout) => {
        if (next === layout) return;
        setStoredLayout(next);
        saveCanopyRailLayout(mx, next);
    };

    // The drop monitor closes over refs so it subscribes once instead of
    // rewiring on every layout/sync tick.
    const layoutRef = useRef(layout);
    layoutRef.current = layout;
    const mxRef = useRef(mx);
    mxRef.current = mx;
    const setStoredLayoutRef = useRef(setStoredLayout);
    setStoredLayoutRef.current = setStoredLayout;
    useEffect(
        () =>
            monitorForElements({
                canMonitor: ({ source }) => isRailDragData(source.data),
                onDrop: ({ source, location: dropLocation }) => {
                    const target = dropLocation.current.dropTargets[0];
                    if (!target || !isRailDragData(source.data) || !isRailDragData(target.data)) {
                        return;
                    }
                    const targetData = target.data as RailDragData & {
                        dropRegion?: DropRegion;
                        targetFolderId?: string;
                    };
                    if (targetData.key === source.data.key) return;
                    const region = resolveRegion(targetData.dropRegion, source.data);
                    const current = layoutRef.current;
                    const next =
                        region === 'combine'
                            ? combineIntoFolder(current, source.data.key, targetData.key)
                            : moveEntry(current, source.data.key, {
                                  key: targetData.key,
                                  position: region === 'top' ? 'before' : 'after',
                                  folderId: targetData.targetFolderId,
                              });
                    if (next === current) return;
                    setStoredLayoutRef.current(next);
                    saveCanopyRailLayout(mxRef.current, next);
                },
            }),
        []
    );

    const openSpace = (spaceId: string) => {
        setSelectedSpaceId(spaceId);
        setSelectedRoomId(null);
        navigate(buildCommunitiesPath(spaceId, null));
    };

    const toggleFolder = (folderId: string) => {
        commitLayout(toggleFolderCollapsed(layout, folderId));
    };

    const activeRowIndex = selectedSpaceId ? rowIndexByKey.get(selectedSpaceId) ?? -1 : -1;

    const rowTabIndex = (index: number): number =>
        activeRowIndex === -1 ? (index === 0 ? 0 : -1) : activeRowIndex === index ? 0 : -1;

    const focusRow = (index: number) => {
        itemsRef.current[index]?.focus();
    };

    const onRowKeyDown =
        (index: number, row: RailRow): KeyboardEventHandler<HTMLButtonElement> =>
        (event) => {
            // Alt+Arrow reorders without a pointer: top-level rows move
            // through the rail, folder members move within their folder.
            if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                event.preventDefault();
                const offset = event.key === 'ArrowUp' ? -1 : 1;
                const withinFolderId = row.rowKind === 'canopy' ? row.fromFolderId : undefined;
                commitLayout(moveByOffset(layout, row.key, offset, withinFolderId));
                return;
            }
            if (rows.length < 2) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                event.preventDefault();
                focusRow((index + 1) % rows.length);
                return;
            }
            if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                event.preventDefault();
                focusRow((index - 1 + rows.length) % rows.length);
                return;
            }
            if (event.key === 'Home') {
                event.preventDefault();
                focusRow(0);
                return;
            }
            if (event.key === 'End') {
                event.preventDefault();
                focusRow(rows.length - 1);
            }
        };

    const homeActive = isShellPathActive(location.pathname, ROOT_PATH);

    const renderCanopyRow = (room: Room, fromFolderId?: string) => {
        const index = rowIndexByKey.get(room.roomId) ?? 0;
        const row: RailRow = { rowKind: 'canopy', key: room.roomId, fromFolderId };
        return (
            <CanopyTile
                key={room.roomId}
                room={room}
                active={selectedSpaceId === room.roomId}
                unread={canopyUnreads.get(room.roomId) ?? NO_UNREAD}
                mx={mx}
                useAuthentication={useAuthentication}
                tabIndex={rowTabIndex(index)}
                onOpen={openSpace}
                onKeyDown={onRowKeyDown(index, row)}
                itemsRef={itemsRef}
                index={index}
                fromFolderId={fromFolderId}
            />
        );
    };

    return (
        <aside
            data-testid="canopy-sidebar"
            data-shell-region="canopy-sidebar"
            aria-label={`${BLACKOUT_TERMS.canopy.titlePlural} navigation`}
            data-reduced-motion={reducedMotion || undefined}
            className={variant === 'drawer' ? css.railDrawer : css.rail}
        >
            <Link
                to={ROOT_PATH}
                className={css.actionTile}
                data-testid="primary-rail-home"
                aria-label="Home"
                title="Town Square (Home)"
                aria-current={homeActive ? 'page' : undefined}
            >
                <span aria-hidden>🏠</span>
            </Link>

            <span className={css.divider} aria-hidden />

            <div className={css.scroll}>
                {entries.length > 0 ? (
                    entries.map((entry) => {
                        if (entry.kind === 'canopy') return renderCanopyRow(entry.room);
                        const folderIndex = rowIndexByKey.get(entry.folder.id) ?? 0;
                        const folderRow: RailRow = { rowKind: 'folder', key: entry.folder.id };
                        const rollup = entry.rooms.reduce(
                            (acc, room) => {
                                const unread = canopyUnreads.get(room.roomId);
                                if (!unread) return acc;
                                return {
                                    total: acc.total + unread.total,
                                    mentions: acc.mentions + unread.mentions,
                                };
                            },
                            { total: 0, mentions: 0 }
                        );
                        return (
                            <div
                                key={entry.folder.id}
                                className={css.folderGroup}
                                data-testid={`canopy-rail-folder-group-${entry.folder.id}`}
                            >
                                <FolderTile
                                    folder={entry.folder}
                                    rooms={entry.rooms}
                                    containsActive={entry.rooms.some(
                                        (room) => room.roomId === selectedSpaceId
                                    )}
                                    unread={rollup}
                                    tabIndex={rowTabIndex(folderIndex)}
                                    onToggle={toggleFolder}
                                    onKeyDown={onRowKeyDown(folderIndex, folderRow)}
                                    itemsRef={itemsRef}
                                    index={folderIndex}
                                />
                                {!entry.folder.collapsed
                                    ? entry.rooms.map((room) =>
                                          renderCanopyRow(room, entry.folder.id)
                                      )
                                    : null}
                            </div>
                        );
                    })
                ) : (
                    <Link
                        to={CANOPIES_PATH}
                        className={css.emptyTile}
                        data-testid="canopy-rail-empty"
                        aria-label={`No ${BLACKOUT_TERMS.canopy.plural} yet — discover ${BLACKOUT_TERMS.canopy.plural}`}
                        title={`No ${BLACKOUT_TERMS.canopy.plural} yet — ${BLACKOUT_GLOSSARY.canopy}`}
                    >
                        <span aria-hidden>🧭</span>
                    </Link>
                )}

                <span className={css.divider} aria-hidden />

                <button
                    type="button"
                    className={css.actionTile}
                    onClick={() => setCreateSpaceModal({})}
                    data-testid="canopy-sidebar-create"
                    aria-label={`New ${BLACKOUT_TERMS.canopy.singular}`}
                    title={`New ${BLACKOUT_TERMS.canopy.singular}`}
                >
                    <span aria-hidden>＋</span>
                </button>
                <Link
                    to={CANOPIES_PATH}
                    className={css.actionTile}
                    data-testid="canopy-sidebar-discover"
                    aria-label={`All ${BLACKOUT_TERMS.canopy.plural}`}
                    title={`All ${BLACKOUT_TERMS.canopy.plural} — ${BLACKOUT_GLOSSARY.canopy}`}
                    aria-current={
                        isShellPathActive(location.pathname, CANOPIES_PATH) ? 'page' : undefined
                    }
                >
                    <span aria-hidden>🧭</span>
                </Link>

                <RegistrySidebarList
                    kind="sidebar"
                    mode="rail"
                    activePath={location.pathname}
                    filter={(entry: ShellPanelEntry) => !PRIMARY_SIDEBAR_PANEL_IDS.has(entry.id)}
                />
                <ThreadUnreadBadgeMount />
            </div>
        </aside>
    );
};

export default CanopyRail;
