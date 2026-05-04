import { describe, expect, it } from 'vitest';
import {
    composeFeatureRoutes,
    composeFeatureSettings,
    composeShellPanels,
} from '../../../../src/app/core/features/composition';
import { buildFeatureRegistry } from '../../../../src/app/core/features/buildRegistry';
import {
    defaultFeatureFlags,
    type FeatureFlags,
} from '../../../../src/app/core/features/featureFlags';

const flagsWithStegoToolkit = (overrides: Partial<FeatureFlags> = {}): FeatureFlags => ({
    ...defaultFeatureFlags,
    stegoToolkit: true,
    ...overrides,
});

describe('stego-toolkit feature module (BKL-005)', () => {
    it('exposes the toolkit route + panels + settings on stego.toolkit.use', () => {
        const flags = flagsWithStegoToolkit();
        const registry = buildFeatureRegistry(flags);

        const without = { capabilities: ['stego.lifecycle.manage'], flags };
        const withToolkit = { capabilities: ['stego.toolkit.use'], flags };

        expect(composeFeatureRoutes(registry, without).map((r) => r.path)).not.toContain(
            '/stego/channels'
        );

        const toolkitRoutes = composeFeatureRoutes(registry, withToolkit).map((r) => r.path);
        expect(toolkitRoutes).toContain('/stego/channels');
        expect(toolkitRoutes).not.toContain('/stego/channels/lifecycle');

        const toolkitPanels = composeShellPanels(registry, withToolkit)
            .map((p) => p.id)
            .filter((id) => id.startsWith('stego.toolkit.'));
        expect(toolkitPanels).toEqual(
            expect.arrayContaining([
                'stego.toolkit.workspace',
                'stego.toolkit.sidebar',
                'stego.toolkit.right-panel',
            ])
        );

        const settings = composeFeatureSettings(registry, withToolkit).map((s) => s.section);
        expect(settings).toContain('Stego / Toolkit');
        expect(settings).not.toContain('Stego / Ephemeral lifecycle');
    });

    it('exposes the ephemeral lifecycle surfaces independently on stego.lifecycle.manage', () => {
        const flags = flagsWithStegoToolkit();
        const registry = buildFeatureRegistry(flags);

        const lifecycle = { capabilities: ['stego.lifecycle.manage'], flags };
        const lifecycleRoutes = composeFeatureRoutes(registry, lifecycle).map((r) => r.path);
        expect(lifecycleRoutes).toContain('/stego/channels/lifecycle');
        expect(lifecycleRoutes).not.toContain('/stego/channels');

        const lifecyclePanels = composeShellPanels(registry, lifecycle)
            .map((p) => p.id)
            .filter((id) => id.startsWith('stego.lifecycle.'));
        expect(lifecyclePanels).toEqual(
            expect.arrayContaining([
                'stego.lifecycle.right-panel',
                'stego.lifecycle.sidebar',
            ])
        );

        const settings = composeFeatureSettings(registry, lifecycle).map((s) => s.section);
        expect(settings).toContain('Stego / Ephemeral lifecycle');
        expect(settings).not.toContain('Stego / Toolkit');
    });

    it('exposes the dedicated settings tab independently on stego.settings.read (BKL-008)', () => {
        const flags = flagsWithStegoToolkit();
        const registry = buildFeatureRegistry(flags);

        const tab = { capabilities: ['stego.settings.read'], flags };
        // Tab carries no routes/panels — it's a settings-only customization.
        expect(
            composeFeatureRoutes(registry, tab)
                .map((r) => r.path)
                .filter((path) => path.startsWith('/stego'))
        ).toEqual([]);
        expect(
            composeShellPanels(registry, tab)
                .map((p) => p.id)
                .filter((id) => id.startsWith('stego.'))
        ).toEqual([]);

        const settings = composeFeatureSettings(registry, tab).map((s) => s.section);
        expect(settings).toContain('Steganography');
        expect(settings).not.toContain('Stego / Toolkit');
        expect(settings).not.toContain('Stego / Ephemeral lifecycle');

        // Granting all three caps surfaces all three sections.
        const fullCaps = {
            capabilities: ['stego.toolkit.use', 'stego.lifecycle.manage', 'stego.settings.read'],
            flags,
        };
        const allSections = composeFeatureSettings(registry, fullCaps).map((s) => s.section);
        expect(allSections).toEqual(
            expect.arrayContaining([
                'Stego / Toolkit',
                'Stego / Ephemeral lifecycle',
                'Steganography',
            ])
        );
    });

    it('disabling the stegoToolkit flag prunes everything', () => {
        const flags = flagsWithStegoToolkit({ stegoToolkit: false });
        const registry = buildFeatureRegistry(flags);
        const fullCaps = {
            capabilities: [
                'stego.toolkit.use',
                'stego.lifecycle.manage',
                'stego.settings.read',
            ],
            flags,
        };

        expect(registry.map((f) => f.id)).not.toContain('stego-toolkit');
        expect(
            composeFeatureRoutes(registry, fullCaps)
                .map((r) => r.path)
                .some((path) => path.startsWith('/stego/channels'))
        ).toBe(false);
        expect(
            composeShellPanels(registry, fullCaps)
                .map((p) => p.id)
                .some((id) => id.startsWith('stego.'))
        ).toBe(false);
        const sections = composeFeatureSettings(registry, fullCaps).map((s) => s.section);
        expect(sections.some((section) => section.startsWith('Stego /'))).toBe(false);
        expect(sections).not.toContain('Steganography');
    });
});
