import type { ShellPanelEntry } from '../../core/features/types';

export const federationHealthPanels: ShellPanelEntry[] = [
    {
        id: 'federation.health.sidebar',
        kind: 'sidebar',
        label: 'Federation health',
        to: '/ops/federation',
        order: 100,
    },
    {
        id: 'federation.health.workspace',
        kind: 'workspace',
        label: 'Federation health',
        to: '/ops/federation',
        order: 100,
    },
];

export const townhallPanels: ShellPanelEntry[] = [
    {
        id: 'townhall.ops.sidebar',
        kind: 'sidebar',
        label: 'Townhall ops',
        to: '/ops/townhall',
        order: 101,
    },
    {
        id: 'townhall.ops.workspace',
        kind: 'workspace',
        label: 'Townhall ops',
        to: '/ops/townhall',
        order: 101,
    },
];

export const revenueOpsPanels: ShellPanelEntry[] = [
    {
        id: 'revenue.ops.sidebar',
        kind: 'sidebar',
        label: 'Revenue ops',
        to: '/ops/revenue',
        order: 102,
    },
    {
        id: 'revenue.ops.workspace',
        kind: 'workspace',
        label: 'Revenue ops',
        to: '/ops/revenue',
        order: 102,
    },
];
