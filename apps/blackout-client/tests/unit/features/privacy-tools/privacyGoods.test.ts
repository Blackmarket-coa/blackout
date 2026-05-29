// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createStore } from 'jotai';
import { parseOwnedPrivacyTier } from '../../../../src/app/features/privacy-tools/privacyGoods';
import {
    bulkDeletionEntitledAtom,
    burnerProEntitledAtom,
    ephemeralProEntitledAtom,
    perturbationEntitledAtom,
    privacyToolsEntitledAtom,
} from '../../../../src/app/features/privacy-tools/privacyToolsAtoms';
import {
    installedPluginsAtom,
    type InstalledPluginRecord,
} from '../../../../src/app/features/monetization/install/installedPluginsAtom';

describe('parseOwnedPrivacyTier', () => {
    it('accepts a well-formed advanced payload', () => {
        expect(
            parseOwnedPrivacyTier({ tier: 'advanced', features: ['exif_strip', 'link_sanitize'] })
        ).toEqual({ tier: 'advanced', features: ['exif_strip', 'link_sanitize'] });
    });

    it('filters unknown features and dedupes', () => {
        expect(
            parseOwnedPrivacyTier({
                tier: 'advanced',
                features: ['exif_strip', 'exif_strip', 'bogus'],
            })
        ).toEqual({ tier: 'advanced', features: ['exif_strip'] });
    });

    it('defaults features to empty when missing or malformed', () => {
        expect(parseOwnedPrivacyTier({ tier: 'advanced' })).toEqual({
            tier: 'advanced',
            features: [],
        });
    });

    it('rejects payloads without the advanced tier', () => {
        expect(parseOwnedPrivacyTier({ tier: 'basic' })).toBeNull();
        expect(parseOwnedPrivacyTier(null)).toBeNull();
        expect(parseOwnedPrivacyTier('advanced')).toBeNull();
    });
});

describe('privacyToolsEntitledAtom', () => {
    const record = (privacyTier?: InstalledPluginRecord['privacyTier']): InstalledPluginRecord =>
        ({
            entitlementId: 'e1',
            manifest: { id: 'p1' } as InstalledPluginRecord['manifest'],
            status: 'enabled',
            installedAt: new Date().toISOString(),
            grantedCapabilities: [],
            privacyTier,
        } as InstalledPluginRecord);

    it('is false with no privacy entitlement installed', () => {
        const store = createStore();
        store.set(installedPluginsAtom, [record()]);
        expect(store.get(privacyToolsEntitledAtom)).toBe(false);
    });

    it('is true when an advanced privacy_tool entitlement is present', () => {
        const store = createStore();
        store.set(installedPluginsAtom, [record({ tier: 'advanced', features: ['exif_strip'] })]);
        expect(store.get(privacyToolsEntitledAtom)).toBe(true);
    });
});

describe('per-feature entitlement atoms', () => {
    const record = (privacyTier?: InstalledPluginRecord['privacyTier']): InstalledPluginRecord =>
        ({
            entitlementId: 'e1',
            manifest: { id: 'p1' } as InstalledPluginRecord['manifest'],
            status: 'enabled',
            installedAt: new Date().toISOString(),
            grantedCapabilities: [],
            privacyTier,
        } as InstalledPluginRecord);

    it('Burner Pro SKU unlocks only burner_pro', () => {
        const store = createStore();
        store.set(installedPluginsAtom, [record({ tier: 'advanced', features: ['burner_pro'] })]);
        expect(store.get(burnerProEntitledAtom)).toBe(true);
        expect(store.get(ephemeralProEntitledAtom)).toBe(false);
        expect(store.get(bulkDeletionEntitledAtom)).toBe(false);
    });

    it('Sovereignty Bundle unlocks every Pro tier and perturbation', () => {
        const store = createStore();
        store.set(installedPluginsAtom, [
            record({
                tier: 'advanced',
                features: ['burner_pro', 'ephemeral_pro', 'bulk_deletion', 'perturbation'],
            }),
        ]);
        expect(store.get(burnerProEntitledAtom)).toBe(true);
        expect(store.get(ephemeralProEntitledAtom)).toBe(true);
        expect(store.get(bulkDeletionEntitledAtom)).toBe(true);
        expect(store.get(perturbationEntitledAtom)).toBe(true);
    });

    it('multiple entitlements stack — any record carrying a feature unlocks it', () => {
        const store = createStore();
        store.set(installedPluginsAtom, [
            record({ tier: 'advanced', features: ['burner_pro'] }),
            record({ tier: 'advanced', features: ['ephemeral_pro'] }),
        ]);
        expect(store.get(burnerProEntitledAtom)).toBe(true);
        expect(store.get(ephemeralProEntitledAtom)).toBe(true);
        expect(store.get(bulkDeletionEntitledAtom)).toBe(false);
    });
});
