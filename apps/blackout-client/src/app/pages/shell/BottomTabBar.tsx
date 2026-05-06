import { type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { RegistryTabBar } from '../../core/features/RegistryTabBar';
import type { ShellPanelEntry } from '../../core/features/types';

const SHELL_DESTINATION_PANEL_IDS = new Set<string>([
    'shell.home',
    'shell.communities',
    'shell.create',
    'shell.market',
    'shell.inbox',
]);

const BOTTOM_TAB_BAR_STYLE: CSSProperties = {
    position: 'sticky',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 30,
};

/**
 * Mobile bottom-tab bar. Reads `kind: 'mobile-tab'` panels from the
 * feature registry and filters to the canonical five AppShell destinations
 * (Home / Communities / Create / Market / Inbox) by panel id. Other
 * features that register mobile-tab entries (e.g. governance for admins)
 * stay registered for legacy surfaces but do not appear in the AppShell
 * bar.
 *
 * Active highlighting is computed from `useLocation()` via
 * `isShellPathActive`, so deep-linking to a sub-route keeps the parent
 * tab highlighted.
 */
export const BottomTabBar = () => {
    const location = useLocation();
    return (
        <div style={BOTTOM_TAB_BAR_STYLE} data-shell-region="bottom-tab-bar">
            <RegistryTabBar
                kind="mobile-tab"
                pathname={location.pathname}
                filter={(entry: ShellPanelEntry) => SHELL_DESTINATION_PANEL_IDS.has(entry.id)}
                data-testid="app-shell-bottom-tab-bar"
            />
        </div>
    );
};

export default BottomTabBar;
