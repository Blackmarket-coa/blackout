import { type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { RegistryTabBar } from '../../core/features/RegistryTabBar';
import type { ShellPanelEntry } from '../../core/features/types';

const WORKSPACE_TAB_BAR_STYLE: CSSProperties = {
    borderBottom: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-nav, #1f2937)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 12px',
};

const HOME_LINK_STYLE: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '8px 10px',
    color: 'var(--text-secondary, #cbd5e1)',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 6,
};

const HOME_LINK_ACTIVE_STYLE: CSSProperties = {
    ...HOME_LINK_STYLE,
    color: 'var(--text-primary, #f8fafc)',
    background: 'var(--bg-hover, rgba(255,255,255,0.06))',
};

const firstSegment = (pathname: string): string => {
    const match = pathname.match(/^\/([^/?#]+)/);
    return match ? match[1] : '';
};

const isHomeActive = (pathname: string): boolean =>
    pathname === '/' || pathname.startsWith('/home');

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
    const homeActive = isHomeActive(location.pathname);
    return (
        <div style={WORKSPACE_TAB_BAR_STYLE} data-shell-region="workspace-tab-bar">
            <Link
                to="/"
                aria-label="Home"
                aria-current={homeActive ? 'page' : undefined}
                data-testid="workspace-tab-bar-home"
                style={homeActive ? HOME_LINK_ACTIVE_STYLE : HOME_LINK_STYLE}
            >
                Home
            </Link>
            {segment ? (
                <RegistryTabBar
                    kind="workspace"
                    pathname={location.pathname}
                    filter={(entry: ShellPanelEntry) => firstSegment(entry.to) === segment}
                    data-testid="app-shell-workspace-tab-bar"
                />
            ) : null}
        </div>
    );
};

export default WorkspaceTabBar;
