import { type CSSProperties } from 'react';
import { useLocation } from 'react-router';
import { RegistryTabBar } from '../../core/features/RegistryTabBar';
import type { ShellPanelEntry } from '../../core/features/types';

const SHELL_DESTINATION_PANEL_IDS = new Set<string>([
    'shell.home',
    'shell.coalition',
    'shell.coliseum',
    'shell.market',
    'shell.streams',
    'shell.profile',
]);

// The bar is a plain flex child at the bottom of the viewport-height shell
// (not `position: sticky`), so it always sits directly above the browser's
// own bottom toolbar instead of underneath it. Hiding collapses its grid row
// to zero so the scroll area grows into the freed space.
const BOTTOM_TAB_BAR_STYLE: CSSProperties = {
    display: 'grid',
    gridTemplateRows: '1fr',
    flexShrink: 0,
    zIndex: 30,
    transition: 'grid-template-rows 180ms ease-out',
};

const BOTTOM_TAB_BAR_HIDDEN_STYLE: CSSProperties = {
    ...BOTTOM_TAB_BAR_STYLE,
    gridTemplateRows: '0fr',
};

const BOTTOM_TAB_BAR_INNER_STYLE: CSSProperties = {
    minHeight: 0,
    overflow: 'hidden',
};

// `visibility: hidden` (applied after the collapse finishes) takes the tabs
// out of the focus order and accessibility tree while tucked away.
const BOTTOM_TAB_BAR_INNER_HIDDEN_STYLE: CSSProperties = {
    ...BOTTOM_TAB_BAR_INNER_STYLE,
    visibility: 'hidden',
    transition: 'visibility 0s linear 180ms',
};

export type BottomTabBarProps = {
    /** Tucks the bar away while the user scrolls down through content. */
    hidden?: boolean;
};

/**
 * Mobile bottom-tab bar. Reads `kind: 'mobile-tab'` panels from the
 * feature registry and filters to the canonical AppShell destinations
 * (Home / Coalition / Coliseum / Market / Streams / Profile) by panel id.
 * Other features that register mobile-tab entries (e.g. governance for
 * admins) stay registered for legacy surfaces but do not appear in the
 * AppShell bar.
 *
 * Active highlighting is computed from `useLocation()` via
 * `isShellPathActive`, so deep-linking to a sub-route keeps the parent
 * tab highlighted.
 */
export const BottomTabBar = ({ hidden = false }: BottomTabBarProps) => {
    const location = useLocation();
    return (
        <div
            style={hidden ? BOTTOM_TAB_BAR_HIDDEN_STYLE : BOTTOM_TAB_BAR_STYLE}
            data-shell-region="bottom-tab-bar"
            data-hidden={hidden ? 'true' : 'false'}
        >
            <div style={hidden ? BOTTOM_TAB_BAR_INNER_HIDDEN_STYLE : BOTTOM_TAB_BAR_INNER_STYLE}>
                <RegistryTabBar
                    kind="mobile-tab"
                    pathname={location.pathname}
                    filter={(entry: ShellPanelEntry) => SHELL_DESTINATION_PANEL_IDS.has(entry.id)}
                    data-testid="app-shell-bottom-tab-bar"
                />
            </div>
        </div>
    );
};

export default BottomTabBar;
