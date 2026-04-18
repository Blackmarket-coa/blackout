import type { EntitlementKey, EntitlementMap, EntitlementTier } from '@blackout/sdk';
import { HOME_PATH, INBOX_NOTIFICATIONS_PATH, SPACE_SETTINGS_PATH } from '../../pages/paths';
import type { SettingsSectionId } from '../settings';

import {
    buildEntitlementAccessPayload,
    type FeaturePresetKey,
} from '../../resolver/capabilityAccessResolver';
import {
    invokeComposerCapability,
    type ComposerCapabilityCommand,
} from '../../plugins/composer/quickActionCatalog';
import {
    WIDGET_PANEL_INVENTORY_IDS,
    type WidgetPanelInventoryId,
} from '../../plugins/right-panel/panelSlots';
import {
    resolveQuickActionEntitlement,
    resolveQuickActionEntitlementMap,
    type QuickActionEntitlementLayers,
} from './entitlementResolver';

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
    | 'compose-invite'
    | 'compose-rich-composer'
    | 'compose-replies'
    | 'compose-edits'
    | 'compose-redactions'
    | 'compose-typing-indicators'
    | 'compose-steganography-layer'
    | 'compose-stego-policy-lifecycle'
    | 'open-widget-townhall-sfu'
    | 'open-widget-widget-shell-layouts'
    | 'open-widget-media-pipeline'
    | 'open-widget-media-spoilers'
    | 'open-widget-media-codeblocks'
    | 'open-widget-media-link-previews'
    | 'open-widget-element-call'
    | 'open-widget-matrix-widget-compat'
    | 'open-widget-soundboard'
    | 'open-widget-numbers-station'
    | 'open-widget-stage-channels';

export interface FeatureEntry {
    id: QuickActionId;
    label: string;
    description: string;
    presetKey: EntitlementKey;
    uiEntry: `${UiEntryKind}:${string}`;
    surfaces: QuickActionSurface[];
    anchor: FeatureControlAnchor;
}

type FeatureRouteAnchor =
    | typeof HOME_PATH
    | typeof INBOX_NOTIFICATIONS_PATH
    | typeof SPACE_SETTINGS_PATH;
type FeatureNavAnchor = 'room-header-actions' | 'composer-slash-commands';

export type FeatureControlAnchor =
    | { kind: 'route'; target: FeatureRouteAnchor }
    | { kind: 'nav'; target: FeatureNavAnchor }
    | { kind: 'settings'; target: SettingsSectionId };

export const FEATURE_ROUTE_ANCHORS = Object.freeze([
    HOME_PATH,
    INBOX_NOTIFICATIONS_PATH,
    SPACE_SETTINGS_PATH,
] as const);
export const FEATURE_NAV_ANCHORS = Object.freeze([
    'room-header-actions',
    'composer-slash-commands',
] as const);
export const FEATURE_SETTINGS_ANCHORS = Object.freeze([
    'account',
    'appearance',
    'notifications',
    'privacy',
    'voice-video',
    'accessibility',
    'keybinds',
    'developer',
    'about',
] as const satisfies ReadonlyArray<SettingsSectionId>);

export interface FeatureEntrypointRegistry {
    preset: FeaturePresetKey;
    flags: EntitlementMap;
    entries: FeatureEntry[];
    entitlementLayers: QuickActionEntitlementLayers;
}

export interface BuildRegistryOptions {
    preset?: FeaturePresetKey;
    deploymentPreset?: FeaturePresetKey;
    orgTier?: EntitlementTier;
    flags?: EntitlementMap;
    orgTierFlags?: EntitlementMap;
    userFlags?: EntitlementMap;
}

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
        anchor: { kind: 'settings', target: 'appearance' },
    },
    {
        id: 'open-devices',
        label: 'Devices',
        description: 'Open voice and camera preferences.',
        presetKey: 'features.settings.account',
        uiEntry: 'settings_toggle:feature-toggle-open-devices',
        surfaces: ['desktop', 'mobile'],
        anchor: { kind: 'settings', target: 'voice-video' },
    },
    {
        id: 'open-inbox',
        label: 'Inbox',
        description: 'Open mention inbox.',
        presetKey: 'features.settings.account',
        uiEntry: 'room_action:feature-room-open-inbox',
        surfaces: ['desktop', 'mobile'],
        anchor: { kind: 'route', target: INBOX_NOTIFICATIONS_PATH },
    },
    {
        id: 'open-threads',
        label: 'Threads',
        description: 'Open thread panel for the active room.',
        presetKey: 'features.timeline.threads',
        uiEntry: 'room_action:feature-room-open-threads',
        surfaces: ['desktop', 'mobile'],
        anchor: { kind: 'nav', target: 'room-header-actions' },
    },
    {
        id: 'open-search',
        label: 'Search',
        description: 'Open room search panel.',
        presetKey: 'features.nav.search',
        uiEntry: 'room_action:feature-room-open-search',
        surfaces: ['desktop', 'mobile'],
        anchor: { kind: 'route', target: HOME_PATH },
    },
    {
        id: 'compose-join',
        label: '/join',
        description: 'Queue the /join command in composer.',
        presetKey: 'features.nav.roomInvites',
        uiEntry: 'composer_action:feature-composer-compose-join',
        surfaces: ['desktop', 'mobile'],
        anchor: { kind: 'nav', target: 'composer-slash-commands' },
    },
    {
        id: 'compose-invite',
        label: '/invite',
        description: 'Queue the /invite command in composer.',
        presetKey: 'features.nav.roomInvites',
        uiEntry: 'composer_action:feature-composer-compose-invite',
        surfaces: ['desktop', 'mobile'],
        anchor: { kind: 'nav', target: 'composer-slash-commands' },
    },
    {
        id: 'compose-rich-composer',
        label: 'Rich composer',
        description: 'Open rich composer controls in the active room.',
        presetKey: 'features.nav.roomInvites',
        uiEntry: 'composer_action:feature-composer-compose-rich-composer',
        surfaces: ['desktop', 'mobile'],
        anchor: { kind: 'nav', target: 'composer-slash-commands' },
    },
    {
        id: 'compose-replies',
        label: 'Reply assist',
        description: 'Prime contextual reply action in composer.',
        presetKey: 'features.nav.roomInvites',
        uiEntry: 'composer_action:feature-composer-compose-replies',
        surfaces: ['desktop', 'mobile'],
        anchor: { kind: 'nav', target: 'composer-slash-commands' },
    },
    {
        id: 'compose-edits',
        label: 'Edit latest',
        description: 'Queue latest-message edit workflow in composer.',
        presetKey: 'features.nav.roomInvites',
        uiEntry: 'composer_action:feature-composer-compose-edits',
        surfaces: ['desktop', 'mobile'],
        anchor: { kind: 'nav', target: 'composer-slash-commands' },
    },
    {
        id: 'compose-redactions',
        label: 'Redact latest',
        description: 'Queue latest-message redaction workflow in composer.',
        presetKey: 'features.nav.roomInvites',
        uiEntry: 'composer_action:feature-composer-compose-redactions',
        surfaces: ['desktop', 'mobile'],
        anchor: { kind: 'nav', target: 'composer-slash-commands' },
    },
    {
        id: 'compose-typing-indicators',
        label: 'Typing controls',
        description: 'Queue typing indicator controls in composer.',
        presetKey: 'features.nav.roomInvites',
        uiEntry: 'composer_action:feature-composer-compose-typing-indicators',
        surfaces: ['desktop', 'mobile'],
        anchor: { kind: 'nav', target: 'composer-slash-commands' },
    },
    {
        id: 'compose-steganography-layer',
        label: 'Steganography',
        description: 'Queue steganography layer controls in composer.',
        presetKey: 'features.nav.roomInvites',
        uiEntry: 'composer_action:feature-composer-compose-steganography-layer',
        surfaces: ['desktop', 'mobile'],
        anchor: { kind: 'nav', target: 'composer-slash-commands' },
    },
    {
        id: 'compose-stego-policy-lifecycle',
        label: 'Stego policy lifecycle',
        description: 'Queue stego enterprise policy lifecycle controls in composer.',
        presetKey: 'features.nav.roomInvites',
        uiEntry: 'composer_action:feature-composer-compose-stego-policy-lifecycle',
        surfaces: ['desktop', 'mobile'],
        anchor: { kind: 'nav', target: 'composer-slash-commands' },
    },
    ...WIDGET_PANEL_INVENTORY_IDS.map((inventoryId): FeatureEntry => ({
        id: `open-widget-${inventoryId.replace(/_/g, '-')}` as QuickActionId,
        label: inventoryId.replace(/_/g, ' '),
        description: `Open installable widget panel ${inventoryId}.`,
        presetKey:
            inventoryId === 'element_call' ? 'features.call.elementCall' : 'features.nav.search',
        uiEntry: `widget_panel:feature-widget-${inventoryId}`,
        surfaces: ['desktop', 'mobile'],
        anchor: { kind: 'nav', target: 'room-header-actions' },
    })),
];

export function assertFeatureEntryAnchor(entry: FeatureEntry): void {
    if (
        (entry.anchor.kind === 'route' && !FEATURE_ROUTE_ANCHORS.includes(entry.anchor.target)) ||
        (entry.anchor.kind === 'nav' && !FEATURE_NAV_ANCHORS.includes(entry.anchor.target)) ||
        (entry.anchor.kind === 'settings' &&
            !FEATURE_SETTINGS_ANCHORS.includes(entry.anchor.target))
    ) {
        throw new Error(
            `[feature-entrypoints] ${entry.id} has unknown ${entry.anchor.kind} anchor ${entry.anchor.target}.`
        );
    }
}

const FEATURE_ENTITLEMENT_KEYS = [
    ...new Set(FEATURE_UI_ENTRIES.map((entry) => entry.presetKey)),
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
    const entitlementLayers = buildEntitlementAccessPayload({
        deploymentPreset,
        orgTier: options.orgTier,
        presetOverride: options.flags,
        orgTierOverride: options.orgTierFlags,
        userOverride: options.userFlags,
    });

    const flags = resolveQuickActionEntitlementMap(FEATURE_ENTITLEMENT_KEYS, entitlementLayers);
    const entries = FEATURE_UI_ENTRIES.filter((entry) =>
        isFeatureFlagEnabled(entry.presetKey, { entitlementLayers })
    );
    return { preset, flags, entries, entitlementLayers };
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

export function assertFeatureEntryInApprovedRegion(entry: FeatureEntry, target: Element): void {
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
    openWidgetPanel: (widgetId: WidgetPanelInventoryId) => void;
    queueCommand: (command: ComposerCapabilityCommand) => void;
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
        case 'compose-rich-composer':
            invokeComposerCapability('rich_composer', context.queueCommand);
            return;
        case 'compose-replies':
            invokeComposerCapability('composer_replies', context.queueCommand);
            return;
        case 'compose-edits':
            invokeComposerCapability('composer_edits', context.queueCommand);
            return;
        case 'compose-redactions':
            invokeComposerCapability('composer_redactions', context.queueCommand);
            return;
        case 'compose-typing-indicators':
            invokeComposerCapability('typing_indicators', context.queueCommand);
            return;
        case 'compose-steganography-layer':
            invokeComposerCapability('steganography_layer', context.queueCommand);
            return;
        case 'compose-stego-policy-lifecycle':
            invokeComposerCapability('stego_policy_lifecycle', context.queueCommand);
            return;
        case 'open-widget-townhall-sfu':
            context.openWidgetPanel('townhall_sfu');
            return;
        case 'open-widget-widget-shell-layouts':
            context.openWidgetPanel('widget_shell_layouts');
            return;
        case 'open-widget-media-pipeline':
            context.openWidgetPanel('media_pipeline');
            return;
        case 'open-widget-media-spoilers':
            context.openWidgetPanel('media_spoilers');
            return;
        case 'open-widget-media-codeblocks':
            context.openWidgetPanel('media_codeblocks');
            return;
        case 'open-widget-media-link-previews':
            context.openWidgetPanel('media_link_previews');
            return;
        case 'open-widget-element-call':
            context.openWidgetPanel('element_call');
            return;
        case 'open-widget-matrix-widget-compat':
            context.openWidgetPanel('matrix_widget_compat');
            return;
        case 'open-widget-soundboard':
            context.openWidgetPanel('soundboard');
            return;
        case 'open-widget-numbers-station':
            context.openWidgetPanel('numbers_station');
            return;
        case 'open-widget-stage-channels':
            context.openWidgetPanel('stage_channels');
            return;
        default: {
            const exhaustive: never = actionId;
            return exhaustive;
        }
    }
}
