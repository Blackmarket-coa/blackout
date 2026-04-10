import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    buildFeatureEntrypointRegistry,
    getQuickActionEntriesForSurface,
    invokeQuickAction,
    QUICK_ACTION_FIRST_RUN_STORAGE_KEY,
    QUICK_ACTION_COLLAPSED_STORAGE_KEY,
    readQuickActionCollapsed,
    writeQuickActionCollapsed,
    getUnseenQuickActionIds,
    markQuickActionsSeen,
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
});
