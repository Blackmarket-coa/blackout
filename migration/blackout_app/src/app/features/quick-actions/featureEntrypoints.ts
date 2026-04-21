export type FeaturePresetKey = 'starter' | 'governance' | 'sovereignty';

export type QuickActionSurface = 'desktop' | 'mobile';

export type QuickActionId =
    | 'open-settings'
    | 'open-devices'
    | 'open-inbox'
    | 'open-threads'
    | 'open-search'
    | 'compose-join'
    | 'compose-invite'
    | 'discover_panel'
    | 'presence_digest'
    | 'community_leaderboards'
    | 'soft_streaks'
    | 'wellbeing_hard_stops';

export type QuickActionPackageId = 'core' | 'growth_pack_engagement_v1';

export interface FeatureEntry {
    id: QuickActionId;
    label: string;
    description: string;
    presetKey: string;
    entitlementKey?: string;
    packageId: QuickActionPackageId;
    surfaces: QuickActionSurface[];
}

export interface FeatureEntrypointRegistry {
    preset: FeaturePresetKey;
    flags: Record<string, boolean>;
    entitlements: Record<string, boolean>;
    entries: FeatureEntry[];
}

export interface BuildRegistryOptions {
    preset?: FeaturePresetKey;
    flags?: Record<string, boolean>;
    entitlements?: Record<string, boolean>;
}

const PRESET_FLAGS: Record<FeaturePresetKey, Record<string, boolean>> = {
    starter: {
        'features.settings.appearance': false,
        'features.settings.account': false,
        'features.nav.roomInvites': false,
        'features.nav.search': false,
        'features.timeline.threads': false,
        'features.bmc.roles': false,
        'features.call.elementCall': false,
        'features.bmc.forum': false,
        'features.engagement.discoverPanel': false,
        'features.engagement.presenceDigest': false,
        'features.engagement.communityLeaderboards': false,
        'features.engagement.softStreaks': false,
        'features.engagement.wellbeingHardStops': false,
    },
    governance: {
        'features.settings.appearance': true,
        'features.settings.account': true,
        'features.nav.roomInvites': false,
        'features.nav.search': false,
        'features.timeline.threads': false,
        'features.bmc.roles': false,
        'features.call.elementCall': false,
        'features.bmc.forum': false,
        'features.engagement.discoverPanel': true,
        'features.engagement.presenceDigest': true,
        'features.engagement.communityLeaderboards': false,
        'features.engagement.softStreaks': true,
        'features.engagement.wellbeingHardStops': true,
    },
    sovereignty: {
        'features.settings.appearance': true,
        'features.settings.account': true,
        'features.nav.roomInvites': true,
        'features.nav.search': true,
        'features.timeline.threads': true,
        'features.bmc.roles': true,
        'features.call.elementCall': true,
        'features.bmc.forum': true,
        'features.engagement.discoverPanel': true,
        'features.engagement.presenceDigest': true,
        'features.engagement.communityLeaderboards': true,
        'features.engagement.softStreaks': true,
        'features.engagement.wellbeingHardStops': true,
    },
};

const FEATURE_ENTRYPOINTS: FeatureEntry[] = [
    {
        id: 'open-settings',
        label: 'Settings',
        description: 'Open appearance and account settings.',
        presetKey: 'features.settings.appearance',
        packageId: 'core',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'open-devices',
        label: 'Devices',
        description: 'Open voice and camera preferences.',
        presetKey: 'features.settings.account',
        packageId: 'core',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'open-inbox',
        label: 'Inbox',
        description: 'Open mention inbox.',
        presetKey: 'features.settings.account',
        packageId: 'core',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'open-threads',
        label: 'Threads',
        description: 'Open thread panel for the active room.',
        presetKey: 'features.timeline.threads',
        packageId: 'core',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'open-search',
        label: 'Search',
        description: 'Open room search panel.',
        presetKey: 'features.nav.search',
        packageId: 'core',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'compose-join',
        label: '/join',
        description: 'Queue the /join command in composer.',
        presetKey: 'features.nav.roomInvites',
        packageId: 'core',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'compose-invite',
        label: '/invite',
        description: 'Queue the /invite command in composer.',
        presetKey: 'features.nav.roomInvites',
        packageId: 'core',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'discover_panel',
        label: 'Discover panel',
        description: 'Open room/community discovery panel.',
        presetKey: 'features.engagement.discoverPanel',
        entitlementKey: 'entitlements.growthPack.engagement.discoverPanel',
        packageId: 'growth_pack_engagement_v1',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'presence_digest',
        label: 'Presence digest',
        description: 'Open notifications digest for member presence updates.',
        presetKey: 'features.engagement.presenceDigest',
        entitlementKey: 'entitlements.growthPack.engagement.presenceDigest',
        packageId: 'growth_pack_engagement_v1',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'community_leaderboards',
        label: 'Community leaderboards',
        description: 'Open community leaderboard panel.',
        presetKey: 'features.engagement.communityLeaderboards',
        entitlementKey: 'entitlements.growthPack.engagement.communityLeaderboards',
        packageId: 'growth_pack_engagement_v1',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'soft_streaks',
        label: 'Soft streaks',
        description: 'Record a soft streak check-in.',
        presetKey: 'features.engagement.softStreaks',
        entitlementKey: 'entitlements.growthPack.engagement.softStreaks',
        packageId: 'growth_pack_engagement_v1',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'wellbeing_hard_stops',
        label: 'Wellbeing hard stops',
        description: 'Open wellbeing hard-stop controls in settings.',
        presetKey: 'features.engagement.wellbeingHardStops',
        entitlementKey: 'entitlements.growthPack.engagement.wellbeingHardStops',
        packageId: 'growth_pack_engagement_v1',
        surfaces: ['desktop', 'mobile'],
    },
];

export const QUICK_ACTION_COLLAPSED_STORAGE_KEY = 'blackout.quick_actions.collapsed';
export const QUICK_ACTION_FIRST_RUN_STORAGE_KEY = 'blackout.quick_actions.seen';

export function buildFeatureEntrypointRegistry(
    options: BuildRegistryOptions = {},
): FeatureEntrypointRegistry {
    const preset = options.preset ?? 'sovereignty';
    const base = PRESET_FLAGS[preset];
    const flags = { ...base, ...(options.flags ?? {}) };
    const entitlements = { ...(options.entitlements ?? {}) };
    const entries = FEATURE_ENTRYPOINTS.filter((entry) => {
        const allowedByPreset = flags[entry.presetKey] ?? false;
        const allowedByEntitlement = entry.entitlementKey
            ? (entitlements[entry.entitlementKey] ?? true)
            : true;
        return allowedByPreset && allowedByEntitlement;
    });
    return { preset, flags, entitlements, entries };
}

export function getQuickActionEntriesForSurface(
    registry: FeatureEntrypointRegistry,
    surface: QuickActionSurface,
): FeatureEntry[] {
    return registry.entries.filter((entry) => entry.surfaces.includes(surface));
}

export function getQuickActionEntriesForPackage(
    registry: FeatureEntrypointRegistry,
    packageId: QuickActionPackageId,
): FeatureEntry[] {
    return registry.entries.filter((entry) => entry.packageId === packageId);
}

export function readQuickActionCollapsed(): boolean {
    return globalThis.localStorage?.getItem(QUICK_ACTION_COLLAPSED_STORAGE_KEY) === 'true';
}

export function writeQuickActionCollapsed(collapsed: boolean): void {
    globalThis.localStorage?.setItem(QUICK_ACTION_COLLAPSED_STORAGE_KEY, String(collapsed));
}

export function getUnseenQuickActionIds(visibleEntries: FeatureEntry[]): QuickActionId[] {
    const raw = globalThis.localStorage?.getItem(QUICK_ACTION_FIRST_RUN_STORAGE_KEY);
    const seen = new Set<QuickActionId>(
        (raw ? (JSON.parse(raw) as QuickActionId[]) : []).filter(Boolean),
    );
    return visibleEntries.map((entry) => entry.id).filter((id) => !seen.has(id));
}

export function markQuickActionsSeen(entryIds: QuickActionId[]): void {
    if (entryIds.length === 0) return;
    const raw = globalThis.localStorage?.getItem(QUICK_ACTION_FIRST_RUN_STORAGE_KEY);
    const seen = new Set<QuickActionId>(
        (raw ? (JSON.parse(raw) as QuickActionId[]) : []).filter(Boolean),
    );
    entryIds.forEach((id) => seen.add(id));
    globalThis.localStorage?.setItem(QUICK_ACTION_FIRST_RUN_STORAGE_KEY, JSON.stringify([...seen]));
}

export interface QuickActionInvocationContext {
    openSettings: () => void;
    openDevices: () => void;
    toggleInbox: () => void;
    openThreads: () => void;
    openSearch: () => void;
    queueCommand: (command: '/join' | '/invite') => void;
    openDiscoverPanel: () => void;
    openPresenceDigest: () => void;
    openCommunityLeaderboards: () => void;
    runSoftStreaks: () => void;
    openWellbeingHardStops: () => void;
}

export function invokeQuickAction(
    actionId: QuickActionId,
    context: QuickActionInvocationContext,
): void {
    switch (actionId) {
        case 'open-settings':
            context.openSettings();
            return;
        case 'open-devices':
            context.openDevices();
            return;
        case 'open-inbox':
            context.toggleInbox();
            return;
        case 'open-threads':
            context.openThreads();
            return;
        case 'open-search':
            context.openSearch();
            return;
        case 'compose-join':
            context.queueCommand('/join');
            return;
        case 'compose-invite':
            context.queueCommand('/invite');
            return;
        case 'discover_panel':
            context.openDiscoverPanel();
            return;
        case 'presence_digest':
            context.openPresenceDigest();
            return;
        case 'community_leaderboards':
            context.openCommunityLeaderboards();
            return;
        case 'soft_streaks':
            context.runSoftStreaks();
            return;
        case 'wellbeing_hard_stops':
            context.openWellbeingHardStops();
            return;
        default: {
            const exhaustive: never = actionId;
            return exhaustive;
        }
    }
}
