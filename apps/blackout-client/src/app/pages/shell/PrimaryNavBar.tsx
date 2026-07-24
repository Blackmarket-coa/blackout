import { type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router';
import { useSetAtom } from 'jotai';
import { RegistryTabBar } from '../../core/features/RegistryTabBar';
import type { ShellPanelEntry } from '../../core/features/types';
import { searchModalAtom } from '../../state/searchModal';
import { PROFILE_SELF_PATH } from '../paths';
import { isShellPathActive } from './modeRouter';

/**
 * The primary destinations shown in the desktop top nav, by panel id.
 * Profile is intentionally excluded — it lives as the avatar on the right.
 * Ordering comes from each panel's `order` (Coliseum 40 → Community Market 45),
 * shared with the mobile BottomTabBar so both bars stay consistent.
 */
const PRIMARY_NAV_PANEL_IDS = new Set<string>([
    'shell.home',
    'shell.streams',
    'shell.coalition',
    'shell.coliseum',
    'shell.market',
]);

const BAR_STYLE: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 52,
    padding: '0 12px',
    background: 'var(--bg-nav, #1f2937)',
    borderBottom: '1px solid var(--border-default, #374151)',
};

const TABS_STYLE: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
    background: 'transparent',
    borderTop: 'none',
    flex: 1,
    paddingBottom: 0,
};

const TAB_ITEM_STYLE: CSSProperties = {
    flex: '0 0 auto',
    flexDirection: 'row',
    gap: 8,
    minHeight: 0,
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
};

const TAB_ITEM_ACTIVE_STYLE: CSSProperties = {
    background: 'var(--bg-hover, rgba(255,255,255,0.06))',
};

const RIGHT_BUTTON_STYLE: CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    textDecoration: 'none',
    fontSize: 16,
};

/**
 * Desktop global top navigation. Renders the canonical primary destinations
 * (Home · Creator Hub · Coalition · Coliseum) plus a search affordance and a
 * profile avatar on the right, on every page via the AppShell. Destination
 * links are gated by feature flag / capability through `RegistryTabBar`, so
 * a link only appears when its route is actually mounted.
 */
export const PrimaryNavBar = () => {
    const location = useLocation();
    const setSearchModal = useSetAtom(searchModalAtom);
    const profileActive = isShellPathActive(location.pathname, PROFILE_SELF_PATH);

    return (
        <div style={BAR_STYLE} data-shell-region="primary-nav-bar" data-testid="primary-nav-bar">
            <RegistryTabBar
                kind="mobile-tab"
                pathname={location.pathname}
                filter={(entry: ShellPanelEntry) => PRIMARY_NAV_PANEL_IDS.has(entry.id)}
                barStyle={TABS_STYLE}
                itemStyle={TAB_ITEM_STYLE}
                activeItemStyle={TAB_ITEM_ACTIVE_STYLE}
                data-testid="primary-nav-bar-tabs"
            />
            <button
                type="button"
                onClick={() => setSearchModal(true)}
                aria-label="Search"
                title="Search"
                data-testid="primary-nav-bar-search"
                style={RIGHT_BUTTON_STYLE}
            >
                🔍
            </button>
            <Link
                to={PROFILE_SELF_PATH}
                aria-label="Profile"
                aria-current={profileActive ? 'page' : undefined}
                title="Profile"
                data-testid="primary-nav-bar-profile"
                style={{
                    ...RIGHT_BUTTON_STYLE,
                    borderRadius: '50%',
                    border: profileActive
                        ? '1px solid var(--accent-primary)'
                        : '1px solid var(--border-default)',
                }}
            >
                👤
            </Link>
        </div>
    );
};

export default PrimaryNavBar;
