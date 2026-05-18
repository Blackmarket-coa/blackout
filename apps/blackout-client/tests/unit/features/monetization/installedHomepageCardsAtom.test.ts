import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import type { PluginManifest } from '@blackout/sdk';
import {
    installedPluginsAtom,
    type InstalledPluginRecord,
    type InstalledPluginStatus,
} from '../../../../src/app/features/monetization/install/installedPluginsAtom';
import { installedHomepageCardsAtom } from '../../../../src/app/features/monetization/install/installedHomepageCardsAtom';

const baseManifest: PluginManifest = {
    id: 'com.example.demo',
    name: 'Demo',
    version: '1.0.0',
    artifactKind: 'manifest_plugin',
    listing: { providerId: 'stripe', providerListingId: 'demo-1' },
    capabilities: [],
    sha256: 'abc',
};

const record = (
    overrides: Partial<InstalledPluginRecord> & { manifest?: Partial<PluginManifest> } = {},
): InstalledPluginRecord => {
    const manifest = { ...baseManifest, ...(overrides.manifest ?? {}) };
    return {
        entitlementId: overrides.entitlementId ?? `ent.${manifest.id}`,
        manifest,
        status: (overrides.status ?? 'enabled') as InstalledPluginStatus,
        installedAt: '2026-05-17T00:00:00Z',
        lastError: overrides.lastError,
        grantedCapabilities: overrides.grantedCapabilities ?? [...manifest.capabilities],
    };
};

describe('installedHomepageCardsAtom', () => {
    it('returns an empty list when nothing is installed', () => {
        const store = createStore();
        expect(store.get(installedHomepageCardsAtom)).toEqual([]);
    });

    it('maps an enabled record with homepageCard into a card', () => {
        const store = createStore();
        store.set(installedPluginsAtom, [
            record({
                manifest: {
                    id: 'com.example.alpha',
                    homepageCard: { title: 'Alpha', subtitle: 'short summary' },
                },
            }),
        ]);

        expect(store.get(installedHomepageCardsAtom)).toEqual([
            {
                pluginId: 'com.example.alpha',
                title: 'Alpha',
                summary: 'short summary',
                iconUrl: undefined,
                href: '/plugins/com.example.alpha',
            },
        ]);
    });

    it('respects an explicit href on the manifest', () => {
        const store = createStore();
        store.set(installedPluginsAtom, [
            record({
                manifest: {
                    id: 'p1',
                    homepageCard: { title: 'P1', to: '/custom/route' },
                },
            }),
        ]);
        expect(store.get(installedHomepageCardsAtom)[0]?.href).toBe('/custom/route');
    });

    it('skips records that are not enabled or have no homepageCard', () => {
        const store = createStore();
        store.set(installedPluginsAtom, [
            record({
                status: 'disabled',
                manifest: { id: 'p1', homepageCard: { title: 'P1' } },
            }),
            record({ status: 'enabled', manifest: { id: 'p2' } }),
        ]);
        expect(store.get(installedHomepageCardsAtom)).toEqual([]);
    });

    it('url-encodes the plugin id in the default href', () => {
        const store = createStore();
        store.set(installedPluginsAtom, [
            record({
                manifest: {
                    id: 'plug in/with spaces',
                    homepageCard: { title: 'X' },
                },
            }),
        ]);
        expect(store.get(installedHomepageCardsAtom)[0]?.href).toBe(
            '/plugins/plug%20in%2Fwith%20spaces',
        );
    });
});
