/**
 * Goods from installed plugins apply only while the plugin is enabled.
 *
 * When the app starts it checks every installed bundle again; one that fails
 * (since 2026-11-17, every bundle signed with the development key, in a
 * production build) is kept with status `error`. Until then the goods readers
 * did not look at the status, so what such a bundle unlocked stayed unlocked.
 */
import { describe, expect, it } from 'vitest';
import { createStore } from 'jotai';
import {
    enabledPluginsAtom,
    installedPluginsAtom,
    type InstalledPluginRecord,
} from '../../../../src/app/features/monetization/install/installedPluginsAtom';
import { ownedAiPersonasAtom } from '../../../../src/app/features/aiden/aiGoodsAtoms';
import {
    perturbationEntitledAtom,
    privacyToolsEntitledAtom,
} from '../../../../src/app/features/privacy-tools/privacyToolsAtoms';

const record = (
    id: string,
    status: InstalledPluginRecord['status'],
    extra: Partial<InstalledPluginRecord>
): InstalledPluginRecord =>
    ({
        entitlementId: `ent-${id}`,
        manifest: {
            id,
            name: id,
            version: '1.0.0',
            artifactKind: 'privacy_tool',
            capabilities: [],
        },
        status,
        installedAt: '2026-11-17T00:00:00.000Z',
        grantedCapabilities: [],
        ...extra,
    } as InstalledPluginRecord);

describe('goods from installed plugins', () => {
    it('come only from enabled plugins', () => {
        const store = createStore();
        const persona = { id: 'p-enabled' } as never;
        store.set(installedPluginsAtom, [
            record('ok', 'enabled', { aiPersona: persona }),
            record('failed-check', 'error', {
                aiPersona: { id: 'p-error' } as never,
                privacyTier: { tier: 'advanced', features: ['perturbation'] } as never,
            }),
            record('off', 'disabled', {
                privacyTier: { tier: 'advanced', features: ['perturbation'] } as never,
            }),
            record('waiting', 'pending', {
                privacyTier: { tier: 'advanced', features: ['perturbation'] } as never,
            }),
        ]);

        expect(store.get(enabledPluginsAtom).map((r) => r.manifest.id)).toEqual(['ok']);
        expect(store.get(ownedAiPersonasAtom)).toEqual([persona]);
        expect(store.get(privacyToolsEntitledAtom)).toBe(false);
        expect(store.get(perturbationEntitledAtom)).toBe(false);
    });

    it('apply again once the plugin is enabled', () => {
        const store = createStore();
        store.set(installedPluginsAtom, [
            record('tool', 'enabled', {
                privacyTier: { tier: 'advanced', features: ['perturbation'] } as never,
            }),
        ]);
        expect(store.get(privacyToolsEntitledAtom)).toBe(true);
        expect(store.get(perturbationEntitledAtom)).toBe(true);
    });
});
