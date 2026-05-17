import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import type { PluginManifest } from '@blackout/sdk';
import {
    installedPluginsAtom,
    type InstalledPluginRecord,
    type InstalledPluginStatus,
} from '../../../../src/app/features/monetization/install/installedPluginsAtom';
import { installedPluginPanelsAtom } from '../../../../src/app/features/monetization/install/installedPluginPanelsAtom';

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
    overrides: Partial<InstalledPluginRecord> & { manifest?: Partial<PluginManifest> } = {}
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

describe('installedPluginPanelsAtom', () => {
    it('returns an empty list when nothing is installed', () => {
        const store = createStore();
        expect(store.get(installedPluginPanelsAtom)).toEqual([]);
    });

    it('maps an enabled record with pinnedNav into a sidebar ShellPanelEntry', () => {
        const store = createStore();
        store.set(installedPluginsAtom, [
            record({
                manifest: {
                    id: 'com.example.alpha',
                    pinnedNav: { label: 'Alpha', order: 25 },
                },
            }),
        ]);

        expect(store.get(installedPluginPanelsAtom)).toEqual([
            {
                id: 'plugin.com.example.alpha.pinnedNav',
                kind: 'sidebar',
                label: 'Alpha',
                to: '/plugins/com.example.alpha',
                order: 25,
            },
        ]);
    });

    it('defaults order to 100 when omitted', () => {
        const store = createStore();
        store.set(installedPluginsAtom, [
            record({ manifest: { id: 'p1', pinnedNav: { label: 'P1' } } }),
        ]);
        expect(store.get(installedPluginPanelsAtom)[0]?.order).toBe(100);
    });

    it('skips records that are not enabled or have no pinnedNav', () => {
        const store = createStore();
        store.set(installedPluginsAtom, [
            record({ status: 'disabled', manifest: { id: 'p1', pinnedNav: { label: 'P1' } } }),
            record({ status: 'pending', manifest: { id: 'p2', pinnedNav: { label: 'P2' } } }),
            record({ status: 'error', manifest: { id: 'p3', pinnedNav: { label: 'P3' } } }),
            record({ status: 'enabled', manifest: { id: 'p4' } }),
        ]);
        expect(store.get(installedPluginPanelsAtom)).toEqual([]);
    });

    it('maps rightPanel and mobileTab manifest fields to ShellPanelEntries', () => {
        const store = createStore();
        store.set(installedPluginsAtom, [
            record({
                manifest: {
                    id: 'com.example.surfaces',
                    rightPanel: { id: 'main', label: 'Right', order: 5 },
                    mobileTab: { id: 'tab', label: 'Tab' },
                },
            }),
        ]);

        const entries = store.get(installedPluginPanelsAtom);
        expect(entries).toEqual(
            expect.arrayContaining([
                {
                    id: 'plugin.com.example.surfaces.rightPanel.main',
                    kind: 'right-panel',
                    label: 'Right',
                    to: '/plugins/com.example.surfaces',
                    order: 5,
                },
                {
                    id: 'plugin.com.example.surfaces.mobileTab.tab',
                    kind: 'mobile-tab',
                    label: 'Tab',
                    to: '/plugins/com.example.surfaces',
                    order: 100,
                },
            ]),
        );
    });

    it('skips rightPanel and mobileTab entries when the plugin is disabled', () => {
        const store = createStore();
        store.set(installedPluginsAtom, [
            record({
                status: 'disabled',
                manifest: {
                    id: 'p.disabled',
                    rightPanel: { id: 'r', label: 'R' },
                    mobileTab: { id: 't', label: 'T' },
                },
            }),
        ]);
        expect(store.get(installedPluginPanelsAtom)).toEqual([]);
    });

    it('url-encodes the plugin id in the to-path', () => {
        const store = createStore();
        store.set(installedPluginsAtom, [
            record({
                manifest: {
                    id: 'plug in/with spaces',
                    pinnedNav: { label: 'X' },
                },
            }),
        ]);
        expect(store.get(installedPluginPanelsAtom)[0]?.to).toBe(
            '/plugins/plug%20in%2Fwith%20spaces'
        );
    });
});
