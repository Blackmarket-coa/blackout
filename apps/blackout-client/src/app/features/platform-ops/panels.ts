import type { ShellPanelEntry } from '../../core/features/types';

/**
 * Shell-level panel contributions for Platform Ops.
 *
 * Mirrors the blackout-web settings IA `workspace|appearance|monetization|
 * mobile|operations` operations slot, plus a sidebar admin entry the
 * canonical client can drive from manifest capability declarations.
 */
export const platformOpsPanels: ShellPanelEntry[] = [
    {
        id: 'platform-ops.workspace',
        kind: 'workspace',
        label: 'Operations',
        to: '/ops/platform',
        order: 80,
    },
    {
        id: 'platform-ops.sidebar',
        kind: 'sidebar',
        label: 'Operations',
        to: '/ops/platform',
        order: 80,
    },
    {
        id: 'platform-ops.right-panel',
        kind: 'right-panel',
        label: 'Operations',
        to: '/ops/platform',
        order: 80,
    },
];

export const platformOpsAdminPanels: ShellPanelEntry[] = [
    {
        id: 'platform-ops.admin.sidebar',
        kind: 'sidebar',
        label: 'Operations Admin',
        to: '/ops/platform/admin',
        order: 90,
    },
];
