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

const flagsWithMediaCall = (overrides: Partial<FeatureFlags> = {}): FeatureFlags => ({
    ...defaultFeatureFlags,
    mediaCall: true,
    ...overrides,
});

describe('media-call feature module (BKL-006)', () => {
    it('exposes media pipeline route + panels + settings on media.pipeline.read', () => {
        const flags = flagsWithMediaCall();
        const registry = buildFeatureRegistry(flags);

        const without = { capabilities: ['call.dialpad.launch'], flags };
        const withMedia = { capabilities: ['media.pipeline.read'], flags };

        expect(composeFeatureRoutes(registry, without).map((r) => r.path)).not.toContain(
            '/media/uploads'
        );
        expect(composeFeatureRoutes(registry, withMedia).map((r) => r.path)).toContain(
            '/media/uploads'
        );

        expect(composeShellPanels(registry, withMedia).map((p) => p.id)).toEqual(
            expect.arrayContaining([
                'media.pipeline.right-panel',
                'media.pipeline.sidebar',
            ])
        );
        expect(
            composeFeatureSettings(registry, withMedia)
                .map((s) => s.section)
                .includes('Media / Pipeline')
        ).toBe(true);
    });

    it('exposes the dialpad surfaces on call.dialpad.launch', () => {
        const flags = flagsWithMediaCall();
        const registry = buildFeatureRegistry(flags);

        const dialpad = { capabilities: ['call.dialpad.launch'], flags };
        const dialpadRoutes = composeFeatureRoutes(registry, dialpad).map((r) => r.path);
        expect(dialpadRoutes).toContain('/call/dialpad');
        expect(dialpadRoutes).not.toContain('/call/element');

        const dialpadPanels = composeShellPanels(registry, dialpad)
            .map((p) => p.id)
            .filter((id) => id.startsWith('call.dialpad.'));
        expect(dialpadPanels).toEqual([
            'call.dialpad.sidebar',
            'call.dialpad.workspace',
        ]);

        const settings = composeFeatureSettings(registry, dialpad).map((s) => s.section);
        expect(settings).toContain('Call / Dialpad');
        expect(settings).not.toContain('Call / Element Call');
    });

    it('exposes Element Call independently on call.element.launch', () => {
        const flags = flagsWithMediaCall();
        const registry = buildFeatureRegistry(flags);

        const element = { capabilities: ['call.element.launch'], flags };
        expect(composeFeatureRoutes(registry, element).map((r) => r.path)).toContain(
            '/call/element'
        );
        expect(composeShellPanels(registry, element).map((p) => p.id)).toContain(
            'call.element.sidebar'
        );
        expect(composeFeatureSettings(registry, element).map((s) => s.section)).toContain(
            'Call / Element Call'
        );
    });

    it('disabling the mediaCall flag prunes everything', () => {
        const flags = flagsWithMediaCall({ mediaCall: false });
        const registry = buildFeatureRegistry(flags);
        const fullCaps = {
            capabilities: [
                'media.pipeline.read',
                'call.dialpad.launch',
                'call.element.launch',
            ],
            flags,
        };

        expect(registry.map((f) => f.id)).not.toContain('media-call');
        expect(composeFeatureRoutes(registry, fullCaps).map((r) => r.path)).not.toContain(
            '/media/uploads'
        );
        expect(
            composeShellPanels(registry, fullCaps)
                .map((p) => p.id)
                .some((id) => id.startsWith('call.'))
        ).toBe(false);
    });
});
