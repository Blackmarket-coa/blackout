import { describe, expect, it } from 'vitest';
import {
    composeFeatureRoutes,
    composeFeatureSettings,
    composeShellPanels,
    selectPanelsByKind,
} from '../../../../src/app/core/features/composition';
import { buildFeatureRegistry } from '../../../../src/app/core/features/buildRegistry';
import {
    defaultFeatureFlags,
    type FeatureFlags,
} from '../../../../src/app/core/features/featureFlags';

const buildFlags = (overrides: Partial<FeatureFlags> = {}): FeatureFlags => ({
    ...defaultFeatureFlags,
    ...overrides,
});

const govContext = (capabilities: string[]) => ({
    capabilities,
    flags: buildFlags(),
});

describe('governance manifest BKL-003 contributions', () => {
    it('contributes the right-panel tab order for governance.read users', () => {
        const registry = buildFeatureRegistry(buildFlags());
        const panels = composeShellPanels(registry, govContext(['governance.read']));
        const tabs = selectPanelsByKind(panels, 'right-panel').filter((p) =>
            p.id.startsWith('governance.right-panel.')
        );

        expect(tabs.map((p) => p.id)).toEqual([
            'governance.right-panel.active',
            'governance.right-panel.past',
            'governance.right-panel.create',
            'governance.right-panel.my-votes',
            'governance.right-panel.results',
        ]);
        expect(tabs.map((p) => p.label)).toEqual([
            'Active',
            'Past',
            'Create',
            'My votes',
            'Results',
        ]);
    });

    it('hides the meetings route + panels until governance.meetings.schedule is granted', () => {
        const registry = buildFeatureRegistry(buildFlags());

        const readOnly = govContext(['governance.read']);
        const readOnlyRoutes = composeFeatureRoutes(registry, readOnly).map((r) => r.path);
        expect(readOnlyRoutes).not.toContain('/governance/meetings');

        const meetingsContext = govContext(['governance.read', 'governance.meetings.schedule']);
        const meetingsRoutes = composeFeatureRoutes(registry, meetingsContext).map((r) => r.path);
        expect(meetingsRoutes).toContain('/governance/meetings');

        const meetingPanels = composeShellPanels(registry, meetingsContext)
            .map((p) => p.id)
            .filter((id) => id.startsWith('governance.meetings.'));
        expect(meetingPanels).toEqual([
            'governance.meetings.sidebar',
            'governance.meetings.workspace',
        ]);
    });

    it('hides the treasury route + panels + settings until governance.treasury.read is granted', () => {
        const registry = buildFeatureRegistry(buildFlags());

        const readOnly = govContext(['governance.read']);
        expect(
            composeFeatureRoutes(registry, readOnly)
                .map((r) => r.path)
                .includes('/governance/treasury')
        ).toBe(false);
        expect(
            composeFeatureSettings(registry, readOnly)
                .map((s) => s.section)
                .some((s) => s.startsWith('Governance / Treasury'))
        ).toBe(false);

        const treasuryContext = govContext(['governance.read', 'governance.treasury.read']);
        const treasuryRoutes = composeFeatureRoutes(registry, treasuryContext).map((r) => r.path);
        expect(treasuryRoutes).toContain('/governance/treasury');
        const treasurySettings = composeFeatureSettings(registry, treasuryContext).map(
            (s) => s.section
        );
        expect(treasurySettings).toContain('Governance / Treasury');
    });

    it('governance is disabled entirely when the governance flag is off', () => {
        const flags = buildFlags({ governance: false });
        const registry = buildFeatureRegistry(flags);
        const context = {
            capabilities: ['governance.read', 'governance.meetings.schedule', 'governance.treasury.read'],
            flags,
        };
        expect(composeFeatureRoutes(registry, context).map((r) => r.path)).not.toContain(
            '/governance/meetings'
        );
        expect(composeFeatureRoutes(registry, context).map((r) => r.path)).not.toContain(
            '/governance/treasury'
        );
    });
});
