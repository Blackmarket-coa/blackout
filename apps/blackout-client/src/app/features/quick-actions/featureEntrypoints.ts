import type { EntitlementKey, EntitlementMap } from '@blackout/sdk';

import {
    resolveQuickActionEntitlement,
    resolveQuickActionEntitlementMap,
    type QuickActionEntitlementLayers,
    type WorkspaceTier,
} from './entitlementResolver';

export type FeaturePresetKey = 'starter' | 'governance' | 'sovereignty';

export type QuickActionSurface = 'desktop' | 'mobile';
export type UiEntryKind =
    | 'settings_toggle'
    | 'composer_action'
    | 'room_action'
    | 'widget_panel'
    | 'admin_console'
    | 'command_palette';
export type ApprovedPanelRegion =
    | 'settings_shell'
    | 'composer_shell'
    | 'room_shell'
    | 'right_panel_shell'
    | 'admin_shell'
    | 'command_palette_shell';

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
    presetKey: EntitlementKey;
    presetKey: string;
    uiEntry: `${UiEntryKind}:${string}`;
    surfaces: QuickActionSurface[];
}

export interface FeatureEntrypointRegistry {
    preset: FeaturePresetKey;
    flags: Record<string, boolean>;
    entries: FeatureEntry[];
    entitlementLayers: QuickActionEntitlementLayers;
}

export interface BuildRegistryOptions {
    preset?: FeaturePresetKey;
    deploymentPreset?: FeaturePresetKey;
    workspaceTier?: WorkspaceTier;
    flags?: Record<string, boolean>;
    workspaceFlags?: EntitlementMap;
    userFlags?: EntitlementMap;
}

const PRESET_FLAGS: Record<FeaturePresetKey, EntitlementMap> = {
    starter: {
        'features.settings.appearance': false,
        'features.settings.account': false,
        'features.nav.roomInvites': false,
        'features.nav.search': false,
        'features.timeline.threads': false,
        'features.bmc.roles': false,
        'features.call.elementCall': false,
        'features.bmc.forum': false,
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
    },
};

const WORKSPACE_TIER_FLAGS: Record<WorkspaceTier, EntitlementMap> = {
    free: PRESET_FLAGS.starter,
    pro: PRESET_FLAGS.governance,
    team: {
        ...PRESET_FLAGS.governance,
        'features.nav.search': true,
        'features.timeline.threads': true,
    },
    enterprise: PRESET_FLAGS.sovereignty,
};

const FEATURE_ENTRYPOINTS: FeatureEntry[] = [
export const FEATURE_UI_ENTRY_PREFIX_BY_KIND: Record<UiEntryKind, string> = {
    settings_toggle: 'feature-toggle-',
    composer_action: 'feature-composer-',
    room_action: 'feature-room-',
    widget_panel: 'feature-widget-',
    admin_console: 'feature-admin-',
    command_palette: 'feature-command-',
};

export const FEATURE_PANEL_REGION_BY_KIND: Record<UiEntryKind, ApprovedPanelRegion> = {
    settings_toggle: 'settings_shell',
    composer_action: 'composer_shell',
    room_action: 'room_shell',
    widget_panel: 'right_panel_shell',
    admin_console: 'admin_shell',
    command_palette: 'command_palette_shell',
};

const PANEL_REGION_SELECTOR: Record<ApprovedPanelRegion, string> = {
    settings_shell: '[data-shell-region="settings"]',
    composer_shell: '[data-shell-region="composer"]',
    room_shell: '[data-shell-region="room"]',
    right_panel_shell: '[data-shell-region="right-panel"]',
    admin_shell: '[data-shell-region="admin"]',
    command_palette_shell: '[data-shell-region="command-palette"]',
};

export const FEATURE_UI_ENTRIES: FeatureEntry[] = [
    {
        id: 'open-settings',
        label: 'Settings',
        description: 'Open appearance and account settings.',
        presetKey: 'features.settings.appearance',
        uiEntry: 'settings_toggle:feature-toggle-open-settings',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'open-devices',
        label: 'Devices',
        description: 'Open voice and camera preferences.',
        presetKey: 'features.settings.account',
        uiEntry: 'settings_toggle:feature-toggle-open-devices',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'open-inbox',
        label: 'Inbox',
        description: 'Open mention inbox.',
        presetKey: 'features.settings.account',
        uiEntry: 'room_action:feature-room-open-inbox',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'open-threads',
        label: 'Threads',
        description: 'Open thread panel for the active room.',
        presetKey: 'features.timeline.threads',
        uiEntry: 'room_action:feature-room-open-threads',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'open-search',
        label: 'Search',
        description: 'Open room search panel.',
        presetKey: 'features.nav.search',
        uiEntry: 'room_action:feature-room-open-search',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'compose-join',
        label: '/join',
        description: 'Queue the /join command in composer.',
        presetKey: 'features.nav.roomInvites',
        uiEntry: 'composer_action:feature-composer-compose-join',
        surfaces: ['desktop', 'mobile'],
    },
    {
        id: 'compose-invite',
        label: '/invite',
        description: 'Queue the /invite command in composer.',
        presetKey: 'features.nav.roomInvites',
        uiEntry: 'composer_action:feature-composer-compose-invite',
        surfaces: ['desktop', 'mobile'],
    },
];

const FEATURE_ENTITLEMENT_KEYS = [
    ...new Set(FEATURE_ENTRYPOINTS.map((entry) => entry.presetKey)),
] as EntitlementKey[];

export const QUICK_ACTION_COLLAPSED_STORAGE_KEY = 'blackout.quick_actions.collapsed';
export const QUICK_ACTION_FIRST_RUN_STORAGE_KEY = 'blackout.quick_actions.seen';

export function isFeatureFlagEnabled(
    featureKey: EntitlementKey,
    registry: Pick<FeatureEntrypointRegistry, 'entitlementLayers'>
): boolean {
    return resolveQuickActionEntitlement(featureKey, registry.entitlementLayers).enabled;
}

export function buildFeatureEntrypointRegistry(
    options: BuildRegistryOptions = {}
): FeatureEntrypointRegistry {
    const deploymentPreset = options.deploymentPreset ?? options.preset ?? 'sovereignty';
    const preset = options.preset ?? deploymentPreset;

    const deploymentPresetFlags = {
        ...PRESET_FLAGS[deploymentPreset],
        ...(options.flags ?? {}),
    };

    const workspaceTierFlags = options.workspaceTier
        ? {
              ...WORKSPACE_TIER_FLAGS[options.workspaceTier],
              ...(options.workspaceFlags ?? {}),
          }
        : options.workspaceFlags;

    const entitlementLayers: QuickActionEntitlementLayers = {
        deploymentPreset: deploymentPresetFlags,
        workspaceTier: workspaceTierFlags,
        userOverride: options.userFlags,
    };

    const flags = resolveQuickActionEntitlementMap(FEATURE_ENTITLEMENT_KEYS, entitlementLayers);
    const entries = FEATURE_ENTRYPOINTS.filter((entry) =>
        isFeatureFlagEnabled(entry.presetKey, { entitlementLayers })
    );
    return { preset, flags, entries, entitlementLayers };
    const preset = options.preset ?? 'sovereignty';
    const base = PRESET_FLAGS[preset];
    const flags = { ...base, ...(options.flags ?? {}) };
    const entries = FEATURE_UI_ENTRIES.filter((entry) => flags[entry.presetKey] ?? false);
    return { preset, flags, entries };
}

export function getQuickActionEntriesForSurface(
    registry: FeatureEntrypointRegistry,
    surface: QuickActionSurface
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
        (raw ? (JSON.parse(raw) as QuickActionId[]) : []).filter(Boolean)
    );
    return visibleEntries.map((entry) => entry.id).filter((id) => !seen.has(id));
}

export function markQuickActionsSeen(entryIds: QuickActionId[]): void {
    if (entryIds.length === 0) return;
    const raw = globalThis.localStorage?.getItem(QUICK_ACTION_FIRST_RUN_STORAGE_KEY);
    const seen = new Set<QuickActionId>(
        (raw ? (JSON.parse(raw) as QuickActionId[]) : []).filter(Boolean)
    );
    entryIds.forEach((id) => seen.add(id));
    globalThis.localStorage?.setItem(QUICK_ACTION_FIRST_RUN_STORAGE_KEY, JSON.stringify([...seen]));
}

export function assertFeatureEntryInApprovedRegion(
    entry: FeatureEntry,
    target: Element
): void {
    if (target.closest('[data-shell-region="custom"]')) {
        throw new Error(
            `[feature-entrypoints] ${entry.id} attempted mount inside forbidden custom shell region.`
        );
    }
    const [kind, uiEntryId] = entry.uiEntry.split(':') as [UiEntryKind, string];
    const expectedPrefix = FEATURE_UI_ENTRY_PREFIX_BY_KIND[kind];
    if (!uiEntryId.startsWith(expectedPrefix)) {
        throw new Error(
            `[feature-entrypoints] ${entry.id} has invalid uiEntry "${entry.uiEntry}" for kind "${kind}".`
        );
    }
    const selector = PANEL_REGION_SELECTOR[FEATURE_PANEL_REGION_BY_KIND[kind]];
    if (!target.closest(selector)) {
        throw new Error(
            `[feature-entrypoints] ${entry.id} must render only in ${FEATURE_PANEL_REGION_BY_KIND[kind]}.`
        );
    }
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
    context: QuickActionInvocationContext
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
