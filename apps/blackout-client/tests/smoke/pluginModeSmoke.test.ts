import { beforeEach, describe, expect, it } from 'vitest';
import { createStore } from 'jotai/vanilla';
import { notificationSettingsAtom, normalizeAppearanceTheme } from '../../src/app/features/settings/settingsAtoms';
import { resolveLivekitFocusFromWellKnown, getActionableCallMessage } from '../../src/app/features/call/callHealth';
import { mxcToUrl, getThumbnailUrl } from '../../src/app/utils/media';
import { getMessageActions } from '../../src/app/plugins/composer/quickActionCatalog';
import { flattenSpaceHierarchyForNav } from '../../src/app/plugins/navigation/spaceHierarchyPlugin';
import { buildQuickSwitcherIndex, rankQuickSwitcherResults } from '../../src/app/features/navigation/QuickSwitcher';
import { resolveFeatureFlags, runtimePluginFeatureFlags } from '../../src/app/core/features/featureFlags';
import { clearSession, loadSession, saveSessionSnapshot } from '../../src/client/session';

const createMemoryStorage = () => {
    const storage = new Map<string, string>();

    return {
        clear: () => storage.clear(),
        getItem: (key: string) => storage.get(key) ?? null,
        key: (index: number) => [...storage.keys()][index] ?? null,
        removeItem: (key: string) => {
            storage.delete(key);
        },
        setItem: (key: string, value: string) => {
            storage.set(key, value);
        },
        get length() {
            return storage.size;
        },
    };
};

beforeEach(() => {
    const localStorage = createMemoryStorage();

    Object.defineProperty(globalThis, 'localStorage', {
        value: localStorage,
        configurable: true,
    });

    Object.defineProperty(globalThis, 'window', {
        value: { localStorage },
        configurable: true,
    });
});

describe('[SMOKE_AUTH] auth (login/logout/session restore)', () => {
    it('saves, restores, and clears session snapshots', () => {
        const snapshot = {
            baseUrl: 'https://matrix.example.org',
            accessToken: 'token-1',
            refreshToken: 'refresh-1',
            userId: '@alice:example.org',
            deviceId: 'DEVICE1',
            expiresAt: 123456,
        };

        expect(loadSession()).toBeNull();
        saveSessionSnapshot(snapshot);
        expect(loadSession()).toEqual(snapshot);
        clearSession();
        expect(loadSession()).toBeNull();
    });
});

describe('[SMOKE_TIMELINE] timeline (load/paginate/send/edit/redact/reply/react)', () => {
    it('keeps timeline quick-action adapter payload semantics stable', () => {
        expect(getMessageActions({ msgtype: 'm.text' }).map((item) => item.label)).toContain('React');
        expect(getMessageActions({ msgtype: 'm.file' }).map((item) => item.label)).toContain('Preview');
        expect(
            getMessageActions({ eventType: 'm.room.proposal', msgtype: 'app.blackout.proposal' }).map(
                (item) => item.label
            )
        ).toContain('Thread');
    });
});

describe('[SMOKE_NAV] navigation/layout (home/direct/space switching, right panel toggle)', () => {
    it('flattens space hierarchy deterministically for navigation switching', () => {
        expect(
            flattenSpaceHierarchyForNav([
                { roomId: '!home:example.org', children: [{ roomId: '!space:example.org', children: [] }] },
                { roomId: '!direct:example.org', children: [] },
            ] as any)
        ).toEqual(['!home:example.org', '!space:example.org', '!direct:example.org']);
    });

    it('keeps quick switcher ranking buckets and action entries stable', () => {
        const rooms = [
            {
                roomId: '!exact:example.org',
                name: 'Mentions',
                getType: () => undefined,
                getCanonicalAlias: () => '#mentions:example.org',
                getUnreadNotificationCount: () => 0,
                getLastActiveTimestamp: () => 0,
                getDMInviter: () => undefined,
                getJoinedMembers: () => [],
            },
            {
                roomId: '!recent:example.org',
                name: 'Navigation',
                getType: () => undefined,
                getCanonicalAlias: () => '#navigation:example.org',
                getUnreadNotificationCount: () => 0,
                getLastActiveTimestamp: () => 120,
                getDMInviter: () => undefined,
                getJoinedMembers: () => [],
            },
        ] as any;

        const index = buildQuickSwitcherIndex(rooms);
        const ranked = rankQuickSwitcherResults(index, 'ment');

        expect(ranked[0]?.title).toBe('Mentions');
        expect(index.some((entry) => entry.category === 'Actions' && entry.id === 'action-open-inbox')).toBe(
            true
        );
    });
});

describe('[SMOKE_SETTINGS] settings (theme/notification persistence)', () => {
    it('normalizes legacy theme ids and persists notification defaults', () => {
        expect(normalizeAppearanceTheme('unknown-theme')).toBe('dark_canopy');
        const store = createStore();
        expect(store.get(notificationSettingsAtom).globalMode).toBe('mentions');
        store.set(notificationSettingsAtom, {
            ...store.get(notificationSettingsAtom),
            globalMode: 'muted',
            soundEnabled: false,
        });

        expect(store.get(notificationSettingsAtom).globalMode).toBe('muted');
        expect(store.get(notificationSettingsAtom).soundEnabled).toBe(false);
    });
});

describe('[SMOKE_MEDIA_CALLS] media/calls (send preview + call setup availability indicators)', () => {
    it('resolves media preview urls and call setup readiness indicators', () => {
        expect(mxcToUrl('mxc://cdn.example.org/abc123', 'https://matrix.example.org')).toContain(
            '/_matrix/media/v3/download/'
        );
        expect(getThumbnailUrl('mxc://cdn.example.org/abc123', 320, 240, 'https://matrix.example.org')).toContain(
            'thumbnail/cdn.example.org/abc123?width=320&height=240'
        );

        const degraded = resolveLivekitFocusFromWellKnown({
            'org.matrix.msc4143.rtc_foci': [{ type: 'livekit' }],
        });

        expect(degraded).toBeNull();
        expect(getActionableCallMessage('degraded', 'focus-missing')).toContain('widget fallback mode');
    });
});

describe('mode gate invariants', () => {
    it('keeps plugin-disabled baseline and full-feature toggles reversible', () => {
        const baseline = resolveFeatureFlags({ BLACKOUT_FEATURE_MODE: 'baseline' });
        const full = resolveFeatureFlags({ BLACKOUT_FEATURE_MODE: 'full' });

        Object.values(runtimePluginFeatureFlags).forEach((flagName) => {
            expect(baseline[flagName]).toBe(false);
            expect(full[flagName]).toBe(true);
        });
    });
});
