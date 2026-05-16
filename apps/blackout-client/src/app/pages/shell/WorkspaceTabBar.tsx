import { type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { RegistryTabBar } from '../../core/features/RegistryTabBar';
import type { ShellPanelEntry } from '../../core/features/types';

const WORKSPACE_TAB_BAR_STYLE: CSSProperties = {
    borderBottom: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-nav, #1f2937)',
};

const firstSegment = (pathname: string): string => {
    const match = pathname.match(/^\/([^/?#]+)/);
    return match ? match[1] : '';
};

/**
 * Desktop workspace tab bar. Reads `kind: 'workspace'` panels from the
 * feature registry and shows only the ones whose `to` shares the
 * current pathname's top-level segment, so the bar acts as
 * intra-destination navigation (e.g. on `/governance/*` the user sees
 * `Governance / Meetings / Treasury`, on `/ops/*` the federation /
 * townhall / revenue tabs, etc.). Returns `null` when no panels match
 * — root `/` and feature routes without workspace siblings render
 * nothing.
 *
 * Capability gating is inherited from the registry composer: panels
 * whose owning customization fails `composeShellPanels`' capability
 * check never reach the filter, so the bar disappears for users
 * without the feature capability.
 */
export const WorkspaceTabBar = () => {
    const location = useLocation();
    const segment = firstSegment(location.pathname);
    if (!segment) return null;
    return (
        <div style={WORKSPACE_TAB_BAR_STYLE} data-shell-region="workspace-tab-bar">
            <RegistryTabBar
                kind="workspace"
                pathname={location.pathname}
                filter={(entry: ShellPanelEntry) => firstSegment(entry.to) === segment}
                data-testid="app-shell-workspace-tab-bar"
            />
        </div>
    );
};

export default WorkspaceTabBar;
