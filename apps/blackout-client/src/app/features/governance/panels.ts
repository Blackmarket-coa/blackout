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
