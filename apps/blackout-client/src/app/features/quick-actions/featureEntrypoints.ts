export type FeaturePresetKey = 'starter' | 'governance' | 'sovereignty';

export type QuickActionSurface = 'desktop' | 'mobile';

export type QuickActionId =
    | 'open-settings'
    | 'open-devices'
    | 'open-inbox'
    | 'open-threads'
    | 'open-search'
    | 'compose-join'
    | 'compose-invite';

export interface FeatureEntry {
    id: QuickActionId;
    label: string;
    description: string;
    presetKey: string;
    surfaces: QuickActionSurface[];
}

export interface FeatureEntrypointRegistry {
    preset: FeaturePresetKey;
    flags: Record<string, boolean>;
    entries: FeatureEntry[];
}

export interface BuildRegistryOptions {
    preset?: FeaturePresetKey;
    flags?: Record<string, boolean>;
}

const PRESET_FLAGS: Record<FeaturePresetKey, Record<string, boolean>> = {
    starter: {
        'features.settings.appearance': false,
        'features.settings.account': false,
        'features.nav.roomInvites': false,
        'features.nav.search': false,
        'features.timeline.threads': false,
    },
    governance: {
        'features.settings.appearance': true,
        'features.settings.account': true,
        'features.nav.roomInvites': false,
        'features.nav.search': false,
        'features.timeline.threads': false,
    },
    sovereignty: {
        'features.settings.appearance': true,
        'features.settings.account': true,
        'features.nav.roomInvites': true,
        'features.nav.search': true,
        'features.timeline.threads': true,
    },
};

const FEATURE_ENTRYPOINTS: FeatureEntry[] = [
    {
        id: 'open-settings',
        label: 'Settings',
        description: 'Open appearance and account settings.',
        presetKey: 'features.settings.appearance',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'open-devices',
        label: 'Devices',
        description: 'Open voice and camera preferences.',
        presetKey: 'features.settings.account',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'open-inbox',
        label: 'Inbox',
        description: 'Open mention inbox.',
        presetKey: 'features.settings.account',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'open-threads',
        label: 'Threads',
        description: 'Open thread panel for the active room.',
        presetKey: 'features.timeline.threads',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'open-search',
        label: 'Search',
        description: 'Open room search panel.',
        presetKey: 'features.nav.search',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'compose-join',
        label: '/join',
        description: 'Queue the /join command in composer.',
        presetKey: 'features.nav.roomInvites',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'compose-invite',
        label: '/invite',
        description: 'Queue the /invite command in composer.',
        presetKey: 'features.nav.roomInvites',
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
    const entries = FEATURE_ENTRYPOINTS.filter((entry) => flags[entry.presetKey] ?? false);
    return { preset, flags, entries };
}

export function getQuickActionEntriesForSurface(
    registry: FeatureEntrypointRegistry,
    surface: QuickActionSurface,
): FeatureEntry[] {
    return registry.entries.filter((entry) => entry.surfaces.includes(surface));
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
        default: {
            const exhaustive: never = actionId;
            return exhaustive;
        }
    }
}
