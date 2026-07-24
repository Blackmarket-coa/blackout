import { type CSSProperties } from 'react';
import { useLocation } from 'react-router';
import { RegistryTabBar } from '../../core/features/RegistryTabBar';
import type { ShellPanelEntry } from '../../core/features/types';

const WORKSPACE_TABS_STYLE: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
    background: 'var(--bg-nav, #1f2937)',
    borderTop: 'none',
    borderBottom: '1px solid var(--border-default, #374151)',
    padding: '0 12px',
    paddingBottom: 0,
};

const WORKSPACE_TAB_ITEM_STYLE: CSSProperties = {
    flex: '0 0 auto',
    flexDirection: 'row',
    gap: 6,
    minHeight: 0,
    padding: '8px 10px',
    fontSize: 13,
};

const firstSegment = (pathname: string): string => {
    const match = pathname.match(/^\/([^/?#]+)/);
    return match ? match[1] : '';
};

/**
 * Desktop secondary tab strip, rendered below the global PrimaryNavBar.
 * Reads `kind: 'workspace'` panels from the feature registry and shows
 * only the ones whose `to` shares the current pathname's top-level
 * segment, so the strip acts as intra-destination navigation (e.g. on
 * `/governance/*` the user sees `Governance / Meetings / Treasury`).
 *
 * Returns `null` on the root path (no segment, so no sub-tabs). The
 * primary destinations (Home · Creator Hub · Coalition · Coliseum) now
 * live in PrimaryNavBar, so this strip no longer carries a Home link.
 *
 * Capability gating is inherited from the registry composer: panels whose
 * owning customization fails `composeShellPanels`' capability check never
 * reach the filter, so the strip's contents disappear for users without
 * the feature capability.
 */
export const WorkspaceTabBar = () => {
    const location = useLocation();
    const segment = firstSegment(location.pathname);
    if (!segment) return null;
    return (
        <div data-shell-region="workspace-tab-bar">
            <RegistryTabBar
                kind="workspace"
                pathname={location.pathname}
                filter={(entry: ShellPanelEntry) => firstSegment(entry.to) === segment}
                barStyle={WORKSPACE_TABS_STYLE}
                itemStyle={WORKSPACE_TAB_ITEM_STYLE}
                data-testid="app-shell-workspace-tab-bar"
            />
        </div>
    );
};

export default WorkspaceTabBar;
