import { type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { RegistryTabBar } from '../../core/features/RegistryTabBar';
import type { ShellPanelEntry } from '../../core/features/types';

const RIGHT_PANEL_TAB_BAR_STYLE: CSSProperties = {
    borderBottom: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-nav, #1f2937)',
};

const RIGHT_PANEL_TAB_ITEM_STYLE: CSSProperties = {
    minHeight: 36,
    padding: '6px 8px',
    fontSize: 12,
};

const firstSegment = (pathname: string): string => {
    const match = pathname.match(/^\/([^/?#]+)/);
    return match ? match[1] : '';
};

/**
 * Right-panel tab bar. Renders `kind: 'right-panel'` panels from the
 * feature registry scoped to the current pathname's top-level segment,
 * so destinations with right-panel sub-tabs (governance, stego toolkit,
 * thread activity, media pipeline) surface them inside the shell's
 * right-panel slot.
 *
 * Returns `null` when there are no matching entries.
 *
 * Active-state caveat: panel `to` values that embed a query string
 * (e.g. `/governance?tab=active`) will not be highlighted by the
 * underlying `isShellPathActive` until query-aware matching lands —
 * pure-path entries like `/governance/new` highlight correctly today.
 * The bar still renders so the navigation works; only the active
 * indicator is affected. Tracked alongside Port 1 follow-ups.
 */
export const RightPanelTabBar = () => {
    const location = useLocation();
    const segment = firstSegment(location.pathname);
    if (!segment) return null;
    return (
        <div style={RIGHT_PANEL_TAB_BAR_STYLE} data-shell-region="right-panel-tab-bar">
            <RegistryTabBar
                kind="right-panel"
                pathname={location.pathname}
                filter={(entry: ShellPanelEntry) => firstSegment(entry.to) === segment}
                itemStyle={RIGHT_PANEL_TAB_ITEM_STYLE}
                data-testid="app-shell-right-panel-tab-bar"
            />
        </div>
    );
};

export default RightPanelTabBar;
