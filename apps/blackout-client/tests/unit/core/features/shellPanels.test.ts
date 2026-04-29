import { describe, expect, it } from 'vitest';
import {
    composeShellPanels,
    selectPanelsByKind,
} from '../../../../src/app/core/features/composition';
import type {
    BlackoutFeature,
    ShellPanelEntry,
} from '../../../../src/app/core/features/types';

const buildFeature = (
    id: string,
    panels: ShellPanelEntry[],
    options: { capabilityGate?: { allOf?: string[] } } = {}
): BlackoutFeature => ({
    id,
    name: id,
    customizations: [
        {
            id: `${id}-customization`,
            name: `${id} workbench`,
            category: 'workflow plugin',
            ...(options.capabilityGate ? { capabilityGate: options.capabilityGate } : {}),
            panels,
        },
    ],
});

describe('composeShellPanels', () => {
    it('aggregates panels from a registry sorted by (kind, order, insertion)', () => {
        const registry: BlackoutFeature[] = [
            buildFeature('alpha', [
                { id: 'alpha.workspace', kind: 'workspace', label: 'Alpha', to: '/alpha', order: 20 },
                { id: 'alpha.mobile', kind: 'mobile-tab', label: 'Alpha', to: '/alpha', order: 5 },
            ]),
            buildFeature('beta', [
                { id: 'beta.workspace', kind: 'workspace', label: 'Beta', to: '/beta', order: 10 },
                { id: 'beta.sidebar', kind: 'sidebar', label: 'Beta', to: '/beta' },
            ]),
        ];

        const composed = composeShellPanels(registry);

        expect(composed.map((entry) => entry.id)).toEqual([
            // mobile-tab first (alphabetical by kind), then sidebar, then workspace.
            // Within workspace, beta (order=10) precedes alpha (order=20).
            'alpha.mobile',
            'beta.sidebar',
            'beta.workspace',
            'alpha.workspace',
        ]);
    });

    it('falls back to insertion order when entries omit `order`', () => {
        const registry: BlackoutFeature[] = [
            buildFeature('alpha', [
                { id: 'alpha.workspace', kind: 'workspace', label: 'Alpha', to: '/alpha' },
            ]),
            buildFeature('beta', [
                { id: 'beta.workspace', kind: 'workspace', label: 'Beta', to: '/beta' },
            ]),
        ];

        const composed = composeShellPanels(registry);
        expect(composed.map((entry) => entry.id)).toEqual([
            'alpha.workspace',
            'beta.workspace',
        ]);
    });

    it('respects capabilityGate when a customization requires capabilities the caller lacks', () => {
        const registry: BlackoutFeature[] = [
            buildFeature(
                'governance',
                [
                    {
                        id: 'governance.workspace',
                        kind: 'workspace',
                        label: 'Governance',
                        to: '/governance',
                    },
                ],
                { capabilityGate: { allOf: ['governance.read'] } }
            ),
        ];

        const without = composeShellPanels(registry, { capabilities: [] });
        expect(without).toEqual([]);

        const with_ = composeShellPanels(registry, { capabilities: ['governance.read'] });
        expect(with_.map((entry) => entry.id)).toEqual(['governance.workspace']);
    });
});

describe('selectPanelsByKind', () => {
    it('filters by kind and preserves the input order', () => {
        const panels: ShellPanelEntry[] = [
            { id: 'a.workspace', kind: 'workspace', label: 'A', to: '/a' },
            { id: 'a.mobile', kind: 'mobile-tab', label: 'A', to: '/a' },
            { id: 'b.workspace', kind: 'workspace', label: 'B', to: '/b' },
        ];

        expect(selectPanelsByKind(panels, 'workspace').map((p) => p.id)).toEqual([
            'a.workspace',
            'b.workspace',
        ]);
        expect(selectPanelsByKind(panels, 'mobile-tab').map((p) => p.id)).toEqual([
            'a.mobile',
        ]);
        expect(selectPanelsByKind(panels, 'right-panel')).toEqual([]);
    });
});
