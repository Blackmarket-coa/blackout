import { describe, expect, it } from 'vitest';
import {
    composeShellPanels,
    selectPanelsByKind,
} from '../../../../src/app/core/features/composition';
import type {
    BlackoutFeature,
    ShellPanelEntry,
} from '../../../../src/app/core/features/types';
import { coalitionPanels } from '../../../../src/app/features/coalition/panels';
import { coliseumPanels } from '../../../../src/app/features/coliseum/panels';
import { communitiesPanels } from '../../../../src/app/features/communities/panels';
import { pluginsPanels } from '../../../../src/app/features/plugins/panels';

const buildSyntheticFeature = (
    id: string,
    panels: ShellPanelEntry[],
    capabilityGate: { allOf?: string[]; flags?: string[] },
    capabilities: string[],
): BlackoutFeature => ({
    id,
    name: id,
    customizations: [
        {
            id: `${id}-shell`,
            name: `${id} shell`,
            category: 'visual/layout plugin',
            capabilityGate: capabilityGate as never,
            panels,
        },
    ],
    capabilities,
});

const REGISTRY: BlackoutFeature[] = [
    buildSyntheticFeature(
        'communities',
        communitiesPanels,
        { flags: ['communities'] },
        ['communities.read'],
    ),
    buildSyntheticFeature(
        'coalition',
        coalitionPanels,
        { allOf: ['coalition.read'], flags: ['coalition'] },
        ['coalition.read', 'coalition.write'],
    ),
    buildSyntheticFeature(
        'coliseum',
        coliseumPanels,
        { allOf: ['coliseum.read'], flags: ['coliseum'] },
        ['coliseum.read', 'coliseum.write'],
    ),
    buildSyntheticFeature(
        'plugins',
        pluginsPanels,
        { flags: ['plugins'] },
        ['plugins.read'],
    ),
];

const ALL_CAPABILITIES = [
    'coalition.read',
    'coalition.write',
    'coliseum.read',
    'coliseum.write',
    'communities.read',
    'plugins.read',
];

const ALL_FLAGS_ON = {
    coalition: true,
    coliseum: true,
    communities: true,
    plugins: true,
} as const;

describe('primary rail sidebar panel registration', () => {
    it('exposes sidebar panels for coalition, coliseum, communities, and plugins', () => {
        const sidebar = selectPanelsByKind(
            composeShellPanels(REGISTRY, {
                capabilities: ALL_CAPABILITIES,
                flags: ALL_FLAGS_ON,
            }),
            'sidebar',
        );

        expect(sidebar.map((entry) => entry.id)).toEqual(
            expect.arrayContaining([
                'communities.sidebar',
                'coalition.sidebar',
                'coliseum.sidebar',
                'plugins.sidebar',
            ]),
        );
    });

    it('orders sidebar entries so Communities precedes Coalition, Coliseum, Plugins', () => {
        const sidebar = selectPanelsByKind(
            composeShellPanels(REGISTRY, {
                capabilities: ALL_CAPABILITIES,
                flags: ALL_FLAGS_ON,
            }),
            'sidebar',
        );

        expect(sidebar.map((entry) => entry.id)).toEqual([
            'communities.sidebar',
            'coalition.sidebar',
            'coliseum.sidebar',
            'plugins.sidebar',
        ]);
    });

    it('hides the communities panel when its flag is off', () => {
        const sidebar = selectPanelsByKind(
            composeShellPanels(REGISTRY, {
                capabilities: ALL_CAPABILITIES,
                flags: { ...ALL_FLAGS_ON, communities: false },
            }),
            'sidebar',
        );
        expect(sidebar.map((entry) => entry.id)).not.toContain('communities.sidebar');
    });

    it('hides the plugins panel when its flag is off', () => {
        const sidebar = selectPanelsByKind(
            composeShellPanels(REGISTRY, {
                capabilities: ALL_CAPABILITIES,
                flags: { ...ALL_FLAGS_ON, plugins: false },
            }),
            'sidebar',
        );
        expect(sidebar.map((entry) => entry.id)).not.toContain('plugins.sidebar');
    });

    it('hides coalition and coliseum panels when capabilities are missing', () => {
        const sidebar = selectPanelsByKind(
            composeShellPanels(REGISTRY, {
                capabilities: ['communities.read', 'plugins.read'],
                flags: ALL_FLAGS_ON,
            }),
            'sidebar',
        );
        const ids = sidebar.map((entry) => entry.id);
        expect(ids).not.toContain('coalition.sidebar');
        expect(ids).not.toContain('coliseum.sidebar');
        expect(ids).toContain('communities.sidebar');
        expect(ids).toContain('plugins.sidebar');
    });

    it('routes each panel to its public path', () => {
        const allPanels = [
            ...communitiesPanels,
            ...coalitionPanels,
            ...coliseumPanels,
            ...pluginsPanels,
        ];
        const byId = new Map(allPanels.map((entry) => [entry.id, entry.to]));
        expect(byId.get('communities.sidebar')).toBe('/communities');
        expect(byId.get('coalition.sidebar')).toBe('/coalition');
        expect(byId.get('coliseum.sidebar')).toBe('/coliseum');
        expect(byId.get('plugins.sidebar')).toBe('/plugins');
    });
});
