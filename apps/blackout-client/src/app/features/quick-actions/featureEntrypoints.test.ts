import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    assertFeatureEntryInApprovedRegion,
    buildFeatureEntrypointRegistry,
    FEATURE_PANEL_REGION_BY_KIND,
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
    type UiEntryKind,
} from './featureEntrypoints';

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
        ]);
    });

    it('invokes quick actions via the action adapter', () => {
        const calls: string[] = [];
        const queueCommand = vi.fn((command: '/join' | '/invite') => calls.push(command));

        invokeQuickAction('open-settings', {
            openSettings: () => calls.push('settings'),
            openDevices: () => calls.push('devices'),
            toggleInbox: () => calls.push('inbox'),
            openThreads: () => calls.push('threads'),
            openSearch: () => calls.push('search'),
            queueCommand,
        });

        invokeQuickAction('compose-join', {
            openSettings: () => calls.push('settings'),
            openDevices: () => calls.push('devices'),
            toggleInbox: () => calls.push('inbox'),
            openThreads: () => calls.push('threads'),
            openSearch: () => calls.push('search'),
            queueCommand,
        });

        expect(calls).toEqual(['settings', '/join']);
        expect(queueCommand).toHaveBeenCalledWith('/join');
    });

    it('maintains mobile/desktop render parity and first-run guidance behavior', () => {
        const registry = buildFeatureEntrypointRegistry({ preset: 'sovereignty' });
        const desktopIds = getQuickActionEntriesForSurface(registry, 'desktop').map(
            (entry) => entry.id,
        );
        const mobileIds = getQuickActionEntriesForSurface(registry, 'mobile').map(
            (entry) => entry.id,
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
        }
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
