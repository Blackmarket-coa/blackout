import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    assertFeatureEntryAnchor,
    assertFeatureEntryInApprovedRegion,
    buildFeatureEntrypointRegistry,
    FEATURE_NAV_ANCHORS,
    FEATURE_PANEL_REGION_BY_KIND,
    FEATURE_ROUTE_ANCHORS,
    FEATURE_SETTINGS_ANCHORS,
    FEATURE_UI_ENTRIES,
    FEATURE_UI_ENTRY_PREFIX_BY_KIND,
    getQuickActionEntriesForSurface,
    invokeQuickAction,
    QUICK_ACTION_FIRST_RUN_STORAGE_KEY,
    QUICK_ACTION_COLLAPSED_STORAGE_KEY,
    readQuickActionCollapsed,
    writeQuickActionCollapsed,
    getUnseenQuickActionIds,
    markQuickActionsSeen,
    isFeatureFlagEnabled,
    type UiEntryKind,
} from './featureEntrypoints';
import type { ComposerCapabilityCommand } from '../../plugins/composer/quickActionCatalog';

const createStorage = () => {
    const map = new Map<string, string>();
    return {
        clear: () => map.clear(),
        getItem: (key: string) => map.get(key) ?? null,
        key: (index: number) => [...map.keys()][index] ?? null,
        removeItem: (key: string) => map.delete(key),
        setItem: (key: string, value: string) => map.set(key, value),
        get length() {
            return map.size;
        },
    } satisfies Storage;
};

describe('feature entrypoint registry adapter', () => {
    beforeEach(() => {
        Object.defineProperty(globalThis, 'localStorage', {
            value: createStorage(),
            configurable: true,
        });
        localStorage.clear();
    });

    it('respects preset + flag visibility', () => {
        const starter = buildFeatureEntrypointRegistry({ preset: 'starter' });
        expect(starter.entries.map((entry) => entry.id)).toEqual([]);

        const governanceWithSearch = buildFeatureEntrypointRegistry({
            preset: 'governance',
            flags: { 'features.nav.search': true },
        });
        expect(governanceWithSearch.entries.map((entry) => entry.id)).toEqual([
            'open-settings',
            'open-devices',
            'open-inbox',
            'open-search',
            'open-widget-townhall-sfu',
            'open-widget-widget-shell-layouts',
            'open-widget-media-pipeline',
            'open-widget-media-spoilers',
            'open-widget-media-codeblocks',
            'open-widget-media-link-previews',
            'open-widget-matrix-widget-compat',
            'open-widget-soundboard',
            'open-widget-numbers-station',
            'open-widget-stage-channels',
            'open-widget-watch-party',
        ]);
    });

    it('exposes compose-attach-product only when productAttachments preset key is enabled', () => {
        const off = buildFeatureEntrypointRegistry({ preset: 'sovereignty' });
        expect(off.entries.map((entry) => entry.id)).not.toContain('compose-attach-product');

        const on = buildFeatureEntrypointRegistry({
            preset: 'sovereignty',
            flags: { 'features.bmc.productAttachments': true },
        });
        expect(on.entries.map((entry) => entry.id)).toContain('compose-attach-product');
    });

    it('resolves entitlement precedence for free/pro/team/enterprise tiers', () => {
        const free = buildFeatureEntrypointRegistry({
            deploymentPreset: 'starter',
            orgTier: 'free',
        });
        const pro = buildFeatureEntrypointRegistry({
            deploymentPreset: 'starter',
            orgTier: 'pro',
        });
        const team = buildFeatureEntrypointRegistry({
            deploymentPreset: 'starter',
            orgTier: 'team',
        });
        const enterprise = buildFeatureEntrypointRegistry({
            deploymentPreset: 'starter',
            orgTier: 'enterprise',
            userFlags: { 'features.nav.search': false },
        });

        expect(isFeatureFlagEnabled('features.settings.appearance', free)).toBe(false);
        expect(isFeatureFlagEnabled('features.settings.appearance', pro)).toBe(true);
        expect(isFeatureFlagEnabled('features.timeline.threads', team)).toBe(true);
        expect(isFeatureFlagEnabled('features.nav.search', enterprise)).toBe(false);
    });

    it('falls back to deployment preset when org tier is downgraded away', () => {
        const upgraded = buildFeatureEntrypointRegistry({
            deploymentPreset: 'starter',
            orgTier: 'enterprise',
        });
        const downgraded = buildFeatureEntrypointRegistry({
            deploymentPreset: 'starter',
        });

        expect(isFeatureFlagEnabled('features.bmc.forum', upgraded)).toBe(true);
        expect(isFeatureFlagEnabled('features.bmc.forum', downgraded)).toBe(false);
    });

    it('invokes quick actions via the action adapter', () => {
        const calls: string[] = [];
        const queueCommand = vi.fn((command: ComposerCapabilityCommand) => calls.push(command));

        invokeQuickAction('open-settings', {
            openSettings: () => calls.push('settings'),
            openDevices: () => calls.push('devices'),
            toggleInbox: () => calls.push('inbox'),
            openThreads: () => calls.push('threads'),
            openSearch: () => calls.push('search'),
            openWidgetPanel: (widgetId) => calls.push(widgetId),
            queueCommand,
            openAttachProductDialog: () => calls.push('attach-product'),
        });

        invokeQuickAction('compose-join', {
            openSettings: () => calls.push('settings'),
            openDevices: () => calls.push('devices'),
            toggleInbox: () => calls.push('inbox'),
            openThreads: () => calls.push('threads'),
            openSearch: () => calls.push('search'),
            openWidgetPanel: (widgetId) => calls.push(widgetId),
            queueCommand,
            openAttachProductDialog: () => calls.push('attach-product'),
        });

        invokeQuickAction('compose-steganography-layer', {
            openSettings: () => calls.push('settings'),
            openDevices: () => calls.push('devices'),
            toggleInbox: () => calls.push('inbox'),
            openThreads: () => calls.push('threads'),
            openSearch: () => calls.push('search'),
            openWidgetPanel: (widgetId) => calls.push(widgetId),
            queueCommand,
            openAttachProductDialog: () => calls.push('attach-product'),
        });
        invokeQuickAction('compose-stego-policy-lifecycle', {
            openSettings: () => calls.push('settings'),
            openDevices: () => calls.push('devices'),
            toggleInbox: () => calls.push('inbox'),
            openThreads: () => calls.push('threads'),
            openSearch: () => calls.push('search'),
            openWidgetPanel: (widgetId) => calls.push(widgetId),
            queueCommand,
            openAttachProductDialog: () => calls.push('attach-product'),
        });

        invokeQuickAction('open-widget-media-pipeline', {
            openSettings: () => calls.push('settings'),
            openDevices: () => calls.push('devices'),
            toggleInbox: () => calls.push('inbox'),
            openThreads: () => calls.push('threads'),
            openSearch: () => calls.push('search'),
            openWidgetPanel: (widgetId) => calls.push(widgetId),
            queueCommand,
            openAttachProductDialog: () => calls.push('attach-product'),
        });

        expect(calls).toEqual([
            'settings',
            '/join',
            '/steg-hide',
            '/steg-policy',
            'media_pipeline',
        ]);
        expect(queueCommand).toHaveBeenCalledWith('/join');
        expect(queueCommand).toHaveBeenCalledWith('/steg-hide');
        expect(queueCommand).toHaveBeenCalledWith('/steg-policy');
    });

    it('routes compose-attach-product to openAttachProductDialog without queueing a slash command', () => {
        const queueCommand = vi.fn((_command: ComposerCapabilityCommand) => {});
        const openAttachProductDialog = vi.fn();
        invokeQuickAction('compose-attach-product', {
            openSettings: vi.fn(),
            openDevices: vi.fn(),
            toggleInbox: vi.fn(),
            openThreads: vi.fn(),
            openSearch: vi.fn(),
            openWidgetPanel: vi.fn(),
            queueCommand,
            openAttachProductDialog,
        });

        expect(openAttachProductDialog).toHaveBeenCalledTimes(1);
        expect(queueCommand).not.toHaveBeenCalled();
    });

    it('queues stego quick-actions to slash commands supported by composer command registry', () => {
        const queuedCommands: ComposerCapabilityCommand[] = [];
        const queueCommand = vi.fn((command: ComposerCapabilityCommand) => {
            queuedCommands.push(command);
        });
        const context = {
            openSettings: vi.fn(),
            openDevices: vi.fn(),
            toggleInbox: vi.fn(),
            openThreads: vi.fn(),
            openSearch: vi.fn(),
            openWidgetPanel: vi.fn(),
            queueCommand,
            openAttachProductDialog: vi.fn(),
        };

        invokeQuickAction('compose-steganography-layer', context);
        invokeQuickAction('compose-stego-policy-lifecycle', context);

        expect(queuedCommands).toEqual(['/steg-hide', '/steg-policy']);
    });

    it('maintains mobile/desktop render parity and first-run guidance behavior', () => {
        const registry = buildFeatureEntrypointRegistry({ preset: 'sovereignty' });
        const desktopIds = getQuickActionEntriesForSurface(registry, 'desktop').map(
            (entry) => entry.id
        );
        const mobileIds = getQuickActionEntriesForSurface(registry, 'mobile').map(
            (entry) => entry.id
        );

        expect(desktopIds).toEqual(mobileIds);

        expect(getUnseenQuickActionIds(registry.entries).length).toBe(desktopIds.length);
        markQuickActionsSeen(desktopIds);
        expect(getUnseenQuickActionIds(registry.entries)).toEqual([]);

        writeQuickActionCollapsed(true);
        expect(localStorage.getItem(QUICK_ACTION_COLLAPSED_STORAGE_KEY)).toBe('true');
        expect(readQuickActionCollapsed()).toBe(true);
        expect(localStorage.getItem(QUICK_ACTION_FIRST_RUN_STORAGE_KEY)).toContain('open-settings');
    });

    it('maps each planned module to a stable id, ui kind, and approved panel region', () => {
        const seen = new Set<string>();

        for (const entry of FEATURE_UI_ENTRIES) {
            expect(entry.id).toMatch(/^[a-z]+(?:-[a-z]+)+$/);
            expect(seen.has(entry.id)).toBe(false);
            seen.add(entry.id);
            expect(entry.presetKey.length).toBeGreaterThan(0);
            const [kind, uiEntryId] = entry.uiEntry.split(':') as [UiEntryKind, string];
            expect(uiEntryId.startsWith(FEATURE_UI_ENTRY_PREFIX_BY_KIND[kind])).toBe(true);
            expect(FEATURE_PANEL_REGION_BY_KIND[kind]).toBeTruthy();
            expect(() => assertFeatureEntryAnchor(entry)).not.toThrow();
        }
    });

    it('maps quick-action controls only to existing route/nav/settings anchors', () => {
        expect(FEATURE_ROUTE_ANCHORS.length).toBeGreaterThan(0);
        expect(FEATURE_NAV_ANCHORS.length).toBeGreaterThan(0);
        expect(FEATURE_SETTINGS_ANCHORS.length).toBeGreaterThan(0);

        FEATURE_UI_ENTRIES.forEach((entry) => {
            if (entry.anchor.kind === 'route') {
                expect(FEATURE_ROUTE_ANCHORS).toContain(entry.anchor.target);
                return;
            }
            if (entry.anchor.kind === 'nav') {
                expect(FEATURE_NAV_ANCHORS).toContain(entry.anchor.target);
                return;
            }
            expect(FEATURE_SETTINGS_ANCHORS).toContain(entry.anchor.target);
        });
    });

    it('keeps controls inside existing shell surfaces and avoids new top-level panel roots', () => {
        const disallowedTopLevelRegions = new Set(['admin_shell', 'command_palette_shell']);

        FEATURE_UI_ENTRIES.forEach((entry) => {
            const [kind] = entry.uiEntry.split(':') as [UiEntryKind, string];
            expect(disallowedTopLevelRegions.has(FEATURE_PANEL_REGION_BY_KIND[kind])).toBe(false);
        });
    });

    it('enforces approved panel regions and rejects custom shell roots', () => {
        const roomTarget = {
            closest: (selector: string) => {
                if (selector === '[data-shell-region="room"]') return {};
                return null;
            },
        } as unknown as Element;

        const customTarget = {
            closest: (selector: string) => {
                if (selector === '[data-shell-region="custom"]') return {};
                return null;
            },
        } as unknown as Element;

        const roomActionEntry = FEATURE_UI_ENTRIES.find((entry) => entry.id === 'open-search');
        if (!roomActionEntry) throw new Error('missing open-search entry');
        expect(() => assertFeatureEntryInApprovedRegion(roomActionEntry, roomTarget)).not.toThrow();
        expect(() => assertFeatureEntryInApprovedRegion(roomActionEntry, customTarget)).toThrow(
            /forbidden custom shell region/
        );

        const settingsEntry = FEATURE_UI_ENTRIES.find((entry) => entry.id === 'open-settings');
        if (!settingsEntry) throw new Error('missing open-settings entry');
        expect(() => assertFeatureEntryInApprovedRegion(settingsEntry, roomTarget)).toThrow(
            /must render only in settings_shell/
        );
    });
});
