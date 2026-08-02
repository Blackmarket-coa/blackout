import { useMemo, useRef, useState, type KeyboardEventHandler, type MutableRefObject } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { Link, useLocation, useNavigate } from 'react-router';
import type { MatrixClient, Room } from 'matrix-js-sdk';
import { joinedRoomsAtom } from '../../state/rooms';
import { selectedRoomIdAtom, selectedSpaceIdAtom } from '../../state/navigation';
import { createSpaceModalAtom } from '../../state/createSpaceModal';
import { canopyUnreadsAtom, type CanopyUnread } from '../../state/canopyUnreads';
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
}: CanopyTileProps) => {
    const name = room.name || room.roomId;
    const [imgFailed, setImgFailed] = useState(false);
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
            <button
                ref={(el) => {
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

/**
 * Discord-style canopy rail: the vertical strip of canopy (space) icons the
 * AppShell renders on every desktop page, and which `CanopyServerPage`
 * composes into its compact left drawer (`variant="drawer"`) so mobile users
 * can switch canopies without leaving the chat shell.
 *
 * Selecting a canopy mirrors the old `CanopySidebar.openSpace` contract:
 * set the selection atoms eagerly (no stale-den flash), then navigate to the
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
    const mx = useMatrixClientOrNull();
    const useAuthentication = useMediaAuthentication();
    const reducedMotion = useReducedMotion();
    const navigate = useNavigate();
    const location = useLocation();
    const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);

    const canopies = useMemo(() => rooms.filter((room) => room.getType() === 'm.space'), [rooms]);

    const openSpace = (spaceId: string) => {
        setSelectedSpaceId(spaceId);
        setSelectedRoomId(null);
        navigate(buildCommunitiesPath(spaceId, null));
    };

    const activeIndex = canopies.findIndex((room) => room.roomId === selectedSpaceId);

    const focusItem = (index: number) => {
        itemsRef.current[index]?.focus();
    };

    const onTileKeyDown =
        (index: number): KeyboardEventHandler<HTMLButtonElement> =>
        (event) => {
            if (canopies.length < 2) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                event.preventDefault();
                focusItem((index + 1) % canopies.length);
                return;
            }
            if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                event.preventDefault();
                focusItem((index - 1 + canopies.length) % canopies.length);
                return;
            }
            if (event.key === 'Home') {
                event.preventDefault();
                focusItem(0);
                return;
            }
            if (event.key === 'End') {
                event.preventDefault();
                focusItem(canopies.length - 1);
            }
        };

    const homeActive = isShellPathActive(location.pathname, ROOT_PATH);

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
                {canopies.length > 0 ? (
                    canopies.map((canopy, index) => (
                        <CanopyTile
                            key={canopy.roomId}
                            room={canopy}
                            active={selectedSpaceId === canopy.roomId}
                            unread={canopyUnreads.get(canopy.roomId) ?? NO_UNREAD}
                            mx={mx}
                            useAuthentication={useAuthentication}
                            tabIndex={
                                activeIndex === -1
                                    ? index === 0
                                        ? 0
                                        : -1
                                    : activeIndex === index
                                    ? 0
                                    : -1
                            }
                            onOpen={openSpace}
                            onKeyDown={onTileKeyDown(index)}
                            itemsRef={itemsRef}
                            index={index}
                        />
                    ))
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
