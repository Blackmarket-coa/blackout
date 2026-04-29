import type { ShellPanelEntry } from '../../core/features/types';

/**
 * Shell-level panel contributions for the Governance feature.
 *
 * Produces canonical entries for:
 * - workspace: desktop workspace tab (parity with blackout-web's
 *   `chat|dms|activity|calls|files|repo-tools|discover` tab model)
 * - mobile-tab: mobile bottom tab (parity with blackout-web's mobile
 *   `home|spaces|search|governance|profile` tab bar)
 * - sidebar: desktop sidebar entry (already covered by `governanceNavItems`
 *   for the canonical Cinny shell, but exposed here so wrappers and BKL-002
 *   can consume the same source of truth)
 */
export const governancePanels: ShellPanelEntry[] = [
    {
        id: 'governance.workspace',
        kind: 'workspace',
        label: 'Governance',
        to: '/governance',
        order: 50,
    },
    {
        id: 'governance.mobile-tab',
        kind: 'mobile-tab',
        label: 'Governance',
        to: '/governance',
        order: 50,
    },
    {
        id: 'governance.sidebar',
        kind: 'sidebar',
        label: 'Governance',
        to: '/governance',
        order: 50,
    },
];

/**
 * Right-panel governance tabs (BKL-003 `web.rightpanel.governance`).
 * Each entry is a deep-linkable sub-tab; receivers compute the active tab
 * from the current route + query string (`?tab=<id>` or path suffix).
 */
export const governanceRightPanelTabs: ShellPanelEntry[] = [
    {
        id: 'governance.right-panel.active',
        kind: 'right-panel',
        label: 'Active',
        to: '/governance?tab=active',
        order: 10,
    },
    {
        id: 'governance.right-panel.past',
        kind: 'right-panel',
        label: 'Past',
        to: '/governance?tab=past',
        order: 20,
    },
    {
        id: 'governance.right-panel.create',
        kind: 'right-panel',
        label: 'Create',
        to: '/governance/new',
        order: 30,
    },
    {
        id: 'governance.right-panel.my-votes',
        kind: 'right-panel',
        label: 'My votes',
        to: '/governance?tab=my-votes',
        order: 40,
    },
    {
        id: 'governance.right-panel.results',
        kind: 'right-panel',
        label: 'Results',
        to: '/governance?tab=results',
        order: 50,
    },
];

/**
 * Workspace-level entries for governance scheduling and treasury operations.
 * Both are sidebar-promoted so admins can reach them without going through
 * the right-panel tab bar.
 */
export const governanceMeetingPanels: ShellPanelEntry[] = [
    {
        id: 'governance.meetings.workspace',
        kind: 'workspace',
        label: 'Meetings',
        to: '/governance/meetings',
        order: 60,
    },
    {
        id: 'governance.meetings.sidebar',
        kind: 'sidebar',
        label: 'Meetings',
        to: '/governance/meetings',
        order: 60,
    },
];

export const governanceTreasuryPanels: ShellPanelEntry[] = [
    {
        id: 'governance.treasury.workspace',
        kind: 'workspace',
        label: 'Treasury',
        to: '/governance/treasury',
        order: 70,
    },
    {
        id: 'governance.treasury.sidebar',
        kind: 'sidebar',
        label: 'Treasury',
        to: '/governance/treasury',
        order: 70,
    },
];
