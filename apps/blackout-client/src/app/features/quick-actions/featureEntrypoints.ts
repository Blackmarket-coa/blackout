import {
    FEATURE_PRESET_BUNDLES,
    type FeatureFlagMap,
    type FeaturePresetKey,
} from '../../../lib/bmc-core';
import {
    buildEntitlementAccessPayload,
    resolveCapabilityAccess,
} from '../../resolver/capabilityAccessResolver';
import type {
    EntitlementAccessPayload,
    EntitlementKey,
    EntitlementMap,
    EntitlementTier,
} from '@blackout/sdk';
import type { ComposerCapabilityCommand } from '../../plugins/composer/quickActionCatalog';

export type QuickActionSurface = 'desktop' | 'mobile';

export type UiEntryKind = 'nav' | 'route' | 'settings' | 'widget';

export type QuickActionId =
    | 'open-settings'
    | 'open-devices'
    | 'open-inbox'
    | 'open-threads'
    | 'open-search'
    | 'compose-join'
    | 'compose-invite'
    | 'compose-steganography-layer'
    | 'compose-stego-policy-lifecycle'
    | 'compose-attach-product'
    | 'open-widget-townhall-sfu'
    | 'open-widget-widget-shell-layouts'
    | 'open-widget-media-pipeline'
    | 'open-widget-media-spoilers'
    | 'open-widget-media-codeblocks'
    | 'open-widget-media-link-previews'
    | 'open-widget-matrix-widget-compat'
    | 'open-widget-soundboard'
    | 'open-widget-numbers-station'
    | 'open-widget-stage-channels'
    | 'open-widget-watch-party';

export type FeatureAnchor =
    | { kind: 'route'; target: string }
    | { kind: 'nav'; target: string }
    | { kind: 'settings'; target: string };

export interface FeatureEntry {
    id: QuickActionId;
    label: string;
    description: string;
    presetKey: string;
    surfaces: QuickActionSurface[];
    anchor: FeatureAnchor;
    uiEntry: `${UiEntryKind}:${string}`;
}

export interface FeatureEntrypointRegistry {
    preset: FeaturePresetKey;
    flags: Record<string, boolean>;
    entries: FeatureEntry[];
    entitlementLayers: EntitlementAccessPayload;
}

export interface BuildRegistryOptions {
    preset?: FeaturePresetKey;
    deploymentPreset?: FeaturePresetKey;
    orgTier?: EntitlementTier;
    flags?: FeatureFlagMap;
    userFlags?: EntitlementMap;
}

export const FEATURE_NAV_ANCHORS = [
    'nav-settings',
    'nav-devices',
    'nav-inbox',
    'nav-threads',
] as const;

export const FEATURE_ROUTE_ANCHORS = [
    'route-search',
    'route-join',
    'route-invite',
    'route-steg-hide',
    'route-steg-policy',
    'route-attach-product',
    'route-widget-townhall-sfu',
    'route-widget-widget-shell-layouts',
    'route-widget-media-pipeline',
    'route-widget-media-spoilers',
    'route-widget-media-codeblocks',
    'route-widget-media-link-previews',
    'route-widget-matrix-widget-compat',
    'route-widget-soundboard',
    'route-widget-numbers-station',
    'route-widget-stage-channels',
    'route-widget-watch-party',
] as const;

export const FEATURE_SETTINGS_ANCHORS = [
    'settings-appearance',
    'settings-account',
    'settings-notifications',
] as const;

export const FEATURE_UI_ENTRY_PREFIX_BY_KIND: Record<UiEntryKind, string> = {
    nav: 'nav-',
    route: 'route-',
    settings: 'settings-',
    widget: 'widget-',
};

export const FEATURE_PANEL_REGION_BY_KIND: Record<UiEntryKind, string> = {
    nav: 'nav_shell',
    route: 'room',
    settings: 'settings_shell',
    widget: 'right_panel',
};

const ALL_SURFACES: QuickActionSurface[] = ['desktop', 'mobile'];

const widgetEntry = (
    id: Extract<QuickActionId, `open-widget-${string}`>,
    label: string,
    description: string
): FeatureEntry => {
    const suffix = id.replace(/^open-widget-/, '');
    return {
        id,
        label,
        description,
        presetKey: 'features.widgets.layouts',
        surfaces: ALL_SURFACES,
        anchor: { kind: 'route', target: `route-widget-${suffix}` },
        uiEntry: `widget:widget-${suffix}` as `${UiEntryKind}:${string}`,
    };
};

export const FEATURE_UI_ENTRIES: FeatureEntry[] = [
    {
        id: 'open-settings',
        label: 'Settings',
        description: 'Open appearance and account settings.',
        presetKey: 'features.settings.appearance',
        surfaces: ALL_SURFACES,
        anchor: { kind: 'settings', target: 'settings-appearance' },
        uiEntry: 'settings:settings-appearance',
    },
    {
        id: 'open-devices',
        label: 'Devices',
        description: 'Open voice and camera preferences.',
        presetKey: 'features.settings.account',
        surfaces: ALL_SURFACES,
        anchor: { kind: 'nav', target: 'nav-devices' },
        uiEntry: 'nav:nav-devices',
    },
    {
        id: 'open-inbox',
        label: 'Inbox',
        description: 'Open mention inbox.',
        presetKey: 'features.settings.account',
        surfaces: ALL_SURFACES,
        anchor: { kind: 'nav', target: 'nav-inbox' },
        uiEntry: 'nav:nav-inbox',
    },
    {
        id: 'open-threads',
        label: 'Threads',
        description: 'Open thread panel for the active room.',
        presetKey: 'features.timeline.threads',
        surfaces: ALL_SURFACES,
        anchor: { kind: 'nav', target: 'nav-threads' },
        uiEntry: 'nav:nav-threads',
    },
    {
        id: 'open-search',
        label: 'Search',
        description: 'Open room search panel.',
        presetKey: 'features.nav.search',
        surfaces: ALL_SURFACES,
        anchor: { kind: 'route', target: 'route-search' },
        uiEntry: 'route:route-search',
    },
    widgetEntry('open-widget-townhall-sfu', 'Townhall SFU', 'Open the townhall voice/video room.'),
    widgetEntry(
        'open-widget-widget-shell-layouts',
        'Shell Layouts',
        'Open the widget shell layout chooser.'
    ),
    widgetEntry(
        'open-widget-media-pipeline',
        'Media Pipeline',
        'Open the media pipeline configuration panel.'
    ),
    widgetEntry('open-widget-media-spoilers', 'Spoilers', 'Configure spoiler tag behaviors.'),
    widgetEntry(
        'open-widget-media-codeblocks',
        'Code Blocks',
        'Configure code block rendering preferences.'
    ),
    widgetEntry(
        'open-widget-media-link-previews',
        'Link Previews',
        'Configure URL preview policy.'
    ),
    widgetEntry(
        'open-widget-matrix-widget-compat',
        'Matrix Widgets',
        'Open Matrix widget compatibility shim.'
    ),
    widgetEntry('open-widget-soundboard', 'Soundboard', 'Open the soundboard widget.'),
    widgetEntry(
        'open-widget-numbers-station',
        'Numbers Station',
        'Open the numbers station widget.'
    ),
    widgetEntry('open-widget-stage-channels', 'Stage Channels', 'Open the stage channels widget.'),
    widgetEntry('open-widget-watch-party', 'Watch Party', 'Open the watch party widget.'),
    {
        id: 'compose-join',
        label: '/join',
        description: 'Queue the /join command in composer.',
        presetKey: 'features.nav.roomInvites',
        surfaces: ALL_SURFACES,
        anchor: { kind: 'route', target: 'route-join' },
        uiEntry: 'route:route-join',
    },
    {
        id: 'compose-invite',
        label: '/invite',
        description: 'Queue the /invite command in composer.',
        presetKey: 'features.nav.roomInvites',
        surfaces: ALL_SURFACES,
        anchor: { kind: 'route', target: 'route-invite' },
        uiEntry: 'route:route-invite',
    },
    {
        id: 'compose-steganography-layer',
        label: 'Steganography',
        description: 'Queue the /steg-hide composer command.',
        presetKey: 'features.bmc.steganography',
        surfaces: ALL_SURFACES,
        anchor: { kind: 'route', target: 'route-steg-hide' },
        uiEntry: 'route:route-steg-hide',
    },
    {
        id: 'compose-stego-policy-lifecycle',
        label: 'Stego Policy',
        description: 'Queue the /steg-policy composer command.',
        presetKey: 'features.bmc.steganography',
        surfaces: ALL_SURFACES,
        anchor: { kind: 'route', target: 'route-steg-policy' },
        uiEntry: 'route:route-steg-policy',
    },
    {
        id: 'compose-attach-product',
        label: 'Attach product',
        description: 'Attach an FBM product listing to the active room.',
        presetKey: 'features.bmc.productAttachments',
        surfaces: ALL_SURFACES,
        anchor: { kind: 'route', target: 'route-attach-product' },
        uiEntry: 'route:route-attach-product',
    },
];

export const QUICK_ACTION_COLLAPSED_STORAGE_KEY = 'blackout.quick_actions.collapsed';
export const QUICK_ACTION_FIRST_RUN_STORAGE_KEY = 'blackout.quick_actions.seen';

export function buildFeatureEntrypointRegistry(
    options: BuildRegistryOptions = {}
): FeatureEntrypointRegistry {
    const preset = options.deploymentPreset ?? options.preset ?? 'sovereignty';
    const base = FEATURE_PRESET_BUNDLES[preset];
    const flags = { ...base, ...(options.flags ?? {}) };
    const entries = FEATURE_UI_ENTRIES.filter((entry) => flags[entry.presetKey] ?? false);
    const entitlementLayers = buildEntitlementAccessPayload({
        deploymentPreset: preset,
        orgTier: options.orgTier,
        userOverride: options.userFlags,
    });
    return { preset, flags, entries, entitlementLayers };
}

export function isFeatureFlagEnabled(
    key: EntitlementKey,
    registry: FeatureEntrypointRegistry
): boolean {
    return resolveCapabilityAccess(key, registry.entitlementLayers).enabled;
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

export function assertFeatureEntryAnchor(entry: FeatureEntry): void {
    const target = entry.anchor.target;
    if (entry.anchor.kind === 'route') {
        if (!(FEATURE_ROUTE_ANCHORS as readonly string[]).includes(target)) {
            throw new Error(`unknown route anchor: ${target}`);
        }
        return;
    }
    if (entry.anchor.kind === 'nav') {
        if (!(FEATURE_NAV_ANCHORS as readonly string[]).includes(target)) {
            throw new Error(`unknown nav anchor: ${target}`);
        }
        return;
    }
    if (!(FEATURE_SETTINGS_ANCHORS as readonly string[]).includes(target)) {
        throw new Error(`unknown settings anchor: ${target}`);
    }
}

export function assertFeatureEntryInApprovedRegion(entry: FeatureEntry, target: Element): void {
    const [kind] = entry.uiEntry.split(':') as [UiEntryKind, string];
    const expectedRegion = FEATURE_PANEL_REGION_BY_KIND[kind];

    if (target.closest(`[data-shell-region="${expectedRegion}"]`)) {
        return;
    }

    const approvedRegions = new Set(Object.values(FEATURE_PANEL_REGION_BY_KIND));
    for (const region of approvedRegions) {
        if (region === expectedRegion) continue;
        if (target.closest(`[data-shell-region="${region}"]`)) {
            throw new Error(
                `feature entry "${entry.id}" must render only in ${expectedRegion}, but was placed in ${region}`
            );
        }
    }
    throw new Error(`feature entry "${entry.id}" placed in forbidden custom shell region`);
}

const WIDGET_PANEL_ID_BY_ACTION = {
    'open-widget-townhall-sfu': 'townhall_sfu',
    'open-widget-widget-shell-layouts': 'widget_shell_layouts',
    'open-widget-media-pipeline': 'media_pipeline',
    'open-widget-media-spoilers': 'media_spoilers',
    'open-widget-media-codeblocks': 'media_codeblocks',
    'open-widget-media-link-previews': 'media_link_previews',
    'open-widget-matrix-widget-compat': 'matrix_widget_compat',
    'open-widget-soundboard': 'soundboard',
    'open-widget-numbers-station': 'numbers_station',
    'open-widget-stage-channels': 'stage_channels',
    'open-widget-watch-party': 'watch_party',
} as const satisfies Record<Extract<QuickActionId, `open-widget-${string}`>, string>;

export type WidgetPanelId =
    typeof WIDGET_PANEL_ID_BY_ACTION[keyof typeof WIDGET_PANEL_ID_BY_ACTION];

export interface QuickActionInvocationContext {
    openSettings: () => void;
    openDevices: () => void;
    toggleInbox: () => void;
    openThreads: () => void;
    openSearch: () => void;
    openWidgetPanel: (widgetId: WidgetPanelId) => void;
    queueCommand: (command: ComposerCapabilityCommand) => void;
    openAttachProductDialog: () => void;
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
        case 'compose-steganography-layer':
            context.queueCommand('/steg-hide');
            return;
        case 'compose-stego-policy-lifecycle':
            context.queueCommand('/steg-policy');
            return;
        case 'compose-attach-product':
            context.openAttachProductDialog();
            return;
        default: {
            const widgetId = WIDGET_PANEL_ID_BY_ACTION[actionId];
            context.openWidgetPanel(widgetId);
            return;
        }
    }
}
