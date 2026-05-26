/**
 * Coalition Kits: preconfigured community setup packs. Applying a kit to a den
 * or coalition installs a curated bundle of plugins and recommends a set of
 * enabled Coalition tabs, so a new community is usable in one step instead of
 * assembling features by hand. Built on the plugin-installation model.
 */
import type { CoalitionTabId } from './events';
import type { PluginDomain } from '../marketplace/domain';

export const KIT_THEMES = ['mutual_aid', 'market', 'activist'] as const;
export type KitTheme = (typeof KIT_THEMES)[number];

export interface KitPlugin {
    pluginId: string;
    /** Mirrors CreatorArtifactKind; in-tree kit plugins are manifest plugins. */
    artifactKind: 'theme' | 'manifest_plugin' | 'code_plugin' | 'asset_bundle';
    domain: PluginDomain;
}

export interface CoalitionKit {
    id: string;
    name: string;
    description: string;
    theme: KitTheme;
    /** Tabs a den/coalition should enable to use the kit (co.bmc.coalition state). */
    enabledTabs: CoalitionTabId[];
    /** Plugins the kit installs at the target scope. */
    plugins: KitPlugin[];
}

export const KIT_DEFINITIONS: readonly CoalitionKit[] = [
    {
        id: 'mutual-aid',
        name: 'Mutual Aid Hub',
        description:
            'A neighborhood mutual-aid space: a local map, an aid board, events with volunteer + ride sign-ups, and a shared task list.',
        theme: 'mutual_aid',
        enabledTabs: ['chat', 'map', 'events', 'tasks'],
        plugins: [
            { pluginId: 'coalition.mutual-aid-board', artifactKind: 'manifest_plugin', domain: 'coalition' },
            { pluginId: 'coalition.events', artifactKind: 'manifest_plugin', domain: 'coalition' },
            { pluginId: 'coalition.local-map', artifactKind: 'manifest_plugin', domain: 'coalition' },
        ],
    },
    {
        id: 'market',
        name: 'Local Market',
        description:
            'A vendor marketplace community: a storefront shop, a map of seller locations, and a chat for buyers and sellers.',
        theme: 'market',
        enabledTabs: ['chat', 'shop', 'map'],
        plugins: [
            { pluginId: 'coalition.storefront', artifactKind: 'manifest_plugin', domain: 'marketplace' },
            { pluginId: 'coalition.seller-map', artifactKind: 'manifest_plugin', domain: 'coalition' },
        ],
    },
    {
        id: 'activist',
        name: 'Organizing Cell',
        description:
            'An activist organizing space: events + actions, trusted rings, a task board, and shared documents.',
        theme: 'activist',
        enabledTabs: ['chat', 'events', 'rings', 'tasks', 'documents'],
        plugins: [
            { pluginId: 'coalition.events', artifactKind: 'manifest_plugin', domain: 'coalition' },
            { pluginId: 'coalition.rings', artifactKind: 'manifest_plugin', domain: 'coalition' },
            { pluginId: 'coalition.documents', artifactKind: 'manifest_plugin', domain: 'community-infrastructure' },
        ],
    },
];

export function getKit(id: string): CoalitionKit | undefined {
    return KIT_DEFINITIONS.find((kit) => kit.id === id);
}

export function isKitTheme(value: unknown): value is KitTheme {
    return typeof value === 'string' && (KIT_THEMES as readonly string[]).includes(value);
}
