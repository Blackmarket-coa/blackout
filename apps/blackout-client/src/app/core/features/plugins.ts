import type { FeatureModulePlugin } from './types';

/**
 * Plugin boundary: feature module plugins must be registered in
 * `featureModulePluginManifest` and `featureModuleManifest` before being added.
 *
 * Static plugins live here at build time. Marketplace-installed plugins are
 * registered through the dynamic registry below at runtime; the feature
 * registry composes both into a single feature graph.
 */
export const featurePlugins: FeatureModulePlugin[] = [];

type Subscriber = (plugins: FeatureModulePlugin[]) => void;

const dynamicPlugins = new Map<string, FeatureModulePlugin>();
const subscribers = new Set<Subscriber>();

function snapshot(): FeatureModulePlugin[] {
    return [...featurePlugins, ...dynamicPlugins.values()];
}

function notify(): void {
    const next = snapshot();
    for (const sub of subscribers) {
        try {
            sub(next);
        } catch (err) {
            console.warn('[plugins] subscriber threw', err);
        }
    }
}

export function registerDynamicFeaturePlugin(plugin: FeatureModulePlugin): void {
    dynamicPlugins.set(plugin.id, plugin);
    notify();
}

export function unregisterDynamicFeaturePlugin(pluginId: string): void {
    if (dynamicPlugins.delete(pluginId)) notify();
}

export function listDynamicFeaturePlugins(): FeatureModulePlugin[] {
    return [...dynamicPlugins.values()];
}

export function getAllFeaturePlugins(): FeatureModulePlugin[] {
    return snapshot();
}

export function subscribeFeaturePlugins(listener: Subscriber): () => void {
    subscribers.add(listener);
    return () => {
        subscribers.delete(listener);
    };
}

export function _resetDynamicFeaturePluginsForTest(): void {
    dynamicPlugins.clear();
    notify();
}
