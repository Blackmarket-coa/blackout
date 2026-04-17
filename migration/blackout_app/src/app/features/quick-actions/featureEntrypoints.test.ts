import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    buildFeatureEntrypointRegistry,
    getQuickActionEntriesForPackage,
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
            'discover_panel',
            'presence_digest',
            'soft_streaks',
            'wellbeing_hard_stops',
            'open-search',
        ]);
    });

    it('applies entitlement gating for sellable growth pack entries', () => {
        const registry = buildFeatureEntrypointRegistry({
            preset: 'sovereignty',
            entitlements: {
                'entitlements.growthPack.engagement.presenceDigest': false,
                'entitlements.growthPack.engagement.softStreaks': false,
            },
        });
        expect(registry.entries.some((entry) => entry.id === 'presence_digest')).toBe(false);
        expect(registry.entries.some((entry) => entry.id === 'soft_streaks')).toBe(false);
        expect(registry.entries.some((entry) => entry.id === 'community_leaderboards')).toBe(true);
    });

    it('returns package-scoped entry lists without legacy quick-action duplication', () => {
        const registry = buildFeatureEntrypointRegistry({ preset: 'sovereignty' });
        const packaged = getQuickActionEntriesForPackage(registry, 'growth_pack_engagement_v1');
        expect(packaged.map((entry) => entry.id)).toEqual([
            'discover_panel',
            'presence_digest',
            'community_leaderboards',
            'soft_streaks',
            'wellbeing_hard_stops',
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
            openDiscoverPanel: () => calls.push('discover'),
            openPresenceDigest: () => calls.push('presence'),
            openCommunityLeaderboards: () => calls.push('leaderboards'),
            runSoftStreaks: () => calls.push('soft_streaks'),
            openWellbeingHardStops: () => calls.push('wellbeing'),
        });

        invokeQuickAction('compose-join', {
            openSettings: () => calls.push('settings'),
            openDevices: () => calls.push('devices'),
            toggleInbox: () => calls.push('inbox'),
            openThreads: () => calls.push('threads'),
            openSearch: () => calls.push('search'),
            queueCommand,
            openDiscoverPanel: () => calls.push('discover'),
            openPresenceDigest: () => calls.push('presence'),
            openCommunityLeaderboards: () => calls.push('leaderboards'),
            runSoftStreaks: () => calls.push('soft_streaks'),
            openWellbeingHardStops: () => calls.push('wellbeing'),
        });

        invokeQuickAction('presence_digest', {
            openSettings: () => calls.push('settings'),
            openDevices: () => calls.push('devices'),
            toggleInbox: () => calls.push('inbox'),
            openThreads: () => calls.push('threads'),
            openSearch: () => calls.push('search'),
            queueCommand,
            openDiscoverPanel: () => calls.push('discover'),
            openPresenceDigest: () => calls.push('presence'),
            openCommunityLeaderboards: () => calls.push('leaderboards'),
            runSoftStreaks: () => calls.push('soft_streaks'),
            openWellbeingHardStops: () => calls.push('wellbeing'),
        });

        expect(calls).toEqual(['settings', '/join', 'presence']);
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
