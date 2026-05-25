import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import type { InstallScope } from '@blackout/core';
import type { PluginManifest } from '@blackout/sdk';
import {
    currentInstallScopeAtom,
    installScopesEqual,
    installVisibleInScope,
    installedPluginsAtom,
    installedPluginsForScopeAtom,
    type InstalledPluginRecord,
} from '../../../../src/app/features/monetization/install/installedPluginsAtom';

const baseManifest: PluginManifest = {
    id: 'com.example.demo',
    name: 'Demo',
    version: '1.0.0',
    artifactKind: 'manifest_plugin',
    listing: { providerId: 'stripe', providerListingId: 'demo-1' },
    capabilities: [],
    sha256: 'abc',
};

const record = (id: string, scope?: InstallScope): InstalledPluginRecord => ({
    entitlementId: `ent.${id}`,
    manifest: { ...baseManifest, id },
    status: 'enabled',
    installedAt: '2026-05-25T00:00:00Z',
    grantedCapabilities: [],
    ...(scope ? { scope } : {}),
});

const den: InstallScope = { type: 'den', id: 'den-1' };
const otherDen: InstallScope = { type: 'den', id: 'den-2' };
const user: InstallScope = { type: 'user', id: 'u-1' };

describe('installScopesEqual', () => {
    it('matches identical scope type+id and rejects differences / nullish', () => {
        expect(installScopesEqual(den, { type: 'den', id: 'den-1' })).toBe(true);
        expect(installScopesEqual(den, otherDen)).toBe(false);
        expect(installScopesEqual(den, user)).toBe(false);
        expect(installScopesEqual(den, null)).toBe(false);
        expect(installScopesEqual(undefined, den)).toBe(false);
    });
});

describe('installVisibleInScope', () => {
    it('shows everything when there is no current scope', () => {
        expect(installVisibleInScope(record('a', den), null)).toBe(true);
        expect(installVisibleInScope(record('b'), null)).toBe(true);
    });

    it('treats scope-less (legacy/global) records as always visible', () => {
        expect(installVisibleInScope(record('a'), den)).toBe(true);
    });

    it('shows a scoped record only in its exact scope', () => {
        expect(installVisibleInScope(record('a', den), den)).toBe(true);
        expect(installVisibleInScope(record('a', den), otherDen)).toBe(false);
        expect(installVisibleInScope(record('a', den), user)).toBe(false);
    });
});

describe('installedPluginsForScopeAtom', () => {
    it('returns all records unfiltered by default (no current scope)', () => {
        const store = createStore();
        store.set(installedPluginsAtom, [record('global'), record('den', den)]);
        expect(store.get(installedPluginsForScopeAtom).map((r) => r.manifest.id)).toEqual([
            'global',
            'den',
        ]);
    });

    it('filters to scope-matching plus scope-less records when a scope is active', () => {
        const store = createStore();
        store.set(installedPluginsAtom, [
            record('global'),
            record('in-den', den),
            record('other-den', otherDen),
        ]);
        store.set(currentInstallScopeAtom, den);
        expect(store.get(installedPluginsForScopeAtom).map((r) => r.manifest.id).sort()).toEqual([
            'global',
            'in-den',
        ]);
    });
});
