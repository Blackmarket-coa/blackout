import { describe, expect, it } from 'vitest';
import { composeShellPanels } from '../../../../src/app/core/features/composition';
import { shellDestinationsFeature } from '../../../../src/app/features/shell-destinations/manifest';
import { defaultFeatureFlags } from '../../../../src/app/core/features/featureFlags';

const panelIds = (context: { capabilities: string[]; flags: Record<string, boolean> }) =>
    composeShellPanels([shellDestinationsFeature], context as never).map((panel) => panel.id);

const allOn = {
    capabilities: ['profile.read'],
    flags: { ...defaultFeatureFlags, shellAppShell: true },
};

describe('shell-destinations gating', () => {
    it('registers all five destinations when the shell and every feature are enabled', () => {
        expect(panelIds(allOn)).toEqual([
            'shell.home',
            'shell.streams',
            'shell.coalition',
            'shell.coliseum',
            'shell.profile',
        ]);
    });

    it('registers nothing when the shell flag is off', () => {
        expect(
            panelIds({
                capabilities: ['profile.read'],
                flags: { ...defaultFeatureFlags, shellAppShell: false },
            })
        ).toEqual([]);
    });

    it("hides a destination tab when its feature's route flag is off", () => {
        expect(
            panelIds({
                ...allOn,
                flags: { ...allOn.flags, coliseum: false },
            })
        ).toEqual(['shell.home', 'shell.streams', 'shell.coalition', 'shell.profile']);
    });

    it('mirrors the profile route capability gate on the profile tab', () => {
        expect(panelIds({ ...allOn, capabilities: [] })).toEqual([
            'shell.home',
            'shell.streams',
            'shell.coalition',
            'shell.coliseum',
        ]);
    });
});
