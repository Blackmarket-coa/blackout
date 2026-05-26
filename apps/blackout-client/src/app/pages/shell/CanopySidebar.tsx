import { type CSSProperties, useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { joinedRoomsAtom } from '../../state/rooms';
import { selectedRoomIdAtom, selectedSpaceIdAtom } from '../../state/navigation';
import { createSpaceModalAtom } from '../../state/createSpaceModal';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { RegistrySidebarList } from '../../core/features/RegistrySidebarList';
import { ThreadUnreadBadgeMount } from '../../features/auth-threads';
import type { ShellPanelEntry } from '../../core/features/types';
import { COMMUNITIES_PATH, buildCommunitiesPath } from '../paths';

/**
 * Sidebar registry entries already surfaced by the global top nav
 * (PrimaryNavBar) or by the canopy list itself — excluded from the
 * "Browse" section so they are never duplicated in the chrome.
 */
const PRIMARY_SIDEBAR_PANEL_IDS = new Set<string>([
    'home.sidebar',
    'streaming.sidebar',
    'coalition.sidebar',
    'coliseum.sidebar',
    'communities.sidebar',
]);

const SIDEBAR_WIDTH = 232;

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
    padding: '12px 12px 8px',
};

const LIST_STYLE: CSSProperties = {
    position: 'relative',
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '0 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
};

const itemStyle = (active: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    textAlign: 'left',
    padding: '8px 10px',
    borderRadius: 8,
    border: 'none',
    background: active ? 'var(--bg-hover, rgba(255,255,255,0.06))' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    fontSize: 14,
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
    textDecoration: 'none',
});

const ACTIVE_ITEM_STYLE: CSSProperties = {
    background: 'var(--bg-hover, rgba(255,255,255,0.06))',
    color: 'var(--text-primary)',
    fontWeight: 600,
};

const FOOTER_STYLE: CSSProperties = {
    borderTop: '1px solid var(--border-default)',
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
};

const NEW_BUTTON_STYLE: CSSProperties = {
    ...itemStyle(false),
    border: '1px dashed var(--border-default)',
};

/**
 * Global left canopy sidebar, rendered by the AppShell on every desktop
 * page so the user's canopies are reachable from anywhere (Home, Creator
 * Hub, Coalition, Coliseum, and the chat view itself). Selecting a canopy
 * mirrors `CommunitiesView.openSpace`: it sets the selection atoms and
 * navigates to the canonical `/communities/:canopyId` route, which the
 * chat view (ClientLayout) reacts to.
 */
export const CanopySidebar = () => {
    const rooms = useAtomValue(joinedRoomsAtom);
    const selectedSpaceId = useAtomValue(selectedSpaceIdAtom);
    const setSelectedSpaceId = useSetAtom(selectedSpaceIdAtom);
    const setSelectedRoomId = useSetAtom(selectedRoomIdAtom);
    const setCreateSpaceModal = useSetAtom(createSpaceModalAtom);
    const navigate = useNavigate();
    const location = useLocation();

    const joinedSpaces = useMemo(
        () => rooms.filter((room) => room.getType() === 'm.space'),
        [rooms]
    );

    const openSpace = (spaceId: string) => {
        setSelectedSpaceId(spaceId);
        setSelectedRoomId(null);
        navigate(buildCommunitiesPath(spaceId, null));
    };

    return (
        <aside
            data-testid="canopy-sidebar"
            data-shell-region="canopy-sidebar"
            aria-label={`${BLACKOUT_TERMS.canopy.titlePlural} navigation`}
            style={ASIDE_STYLE}
        >
            <div style={HEADER_STYLE}>
                <strong style={{ fontSize: 13, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                    {BLACKOUT_TERMS.canopy.titlePlural}
                </strong>
            </div>

            <div style={LIST_STYLE}>
                {joinedSpaces.length > 0 ? (
                    joinedSpaces.map((space) => {
                        const active = selectedSpaceId === space.roomId;
                        return (
                            <button
                                key={space.roomId}
                                type="button"
                                onClick={() => openSpace(space.roomId)}
                                title={space.name}
                                aria-current={active ? 'page' : undefined}
                                data-testid={`canopy-sidebar-item-${space.roomId}`}
                                style={itemStyle(active)}
                            >
                                <span aria-hidden>🗂️</span>
                                <span
                                    style={{
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {space.name}
                                </span>
                            </button>
                        );
                    })
                ) : (
                    <small style={{ color: 'var(--text-muted)', padding: '8px 10px' }}>
                        No joined {BLACKOUT_TERMS.canopy.plural} yet.
                    </small>
                )}

                <RegistrySidebarList
                    kind="sidebar"
                    mode="list"
                    activePath={location.pathname}
                    filter={(entry: ShellPanelEntry) => !PRIMARY_SIDEBAR_PANEL_IDS.has(entry.id)}
                    itemStyle={itemStyle(false)}
                    activeItemStyle={ACTIVE_ITEM_STYLE}
                />
                <ThreadUnreadBadgeMount />
            </div>

            <div style={FOOTER_STYLE}>
                <Link
                    to={COMMUNITIES_PATH}
                    data-testid="canopy-sidebar-discover"
                    style={itemStyle(false)}
                >
                    <span aria-hidden>🧭</span>
                    <span>Discover {BLACKOUT_TERMS.canopy.plural}</span>
                </Link>
                <button
                    type="button"
                    onClick={() => setCreateSpaceModal({})}
                    data-testid="canopy-sidebar-create"
                    title={`New ${BLACKOUT_TERMS.canopy.singular}`}
                    style={NEW_BUTTON_STYLE}
                >
                    <span aria-hidden>＋</span>
                    <span>New {BLACKOUT_TERMS.canopy.singular}</span>
                </button>
            </div>
        </aside>
    );
};

export default CanopySidebar;
