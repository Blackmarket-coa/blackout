import {
    addRuntimeModuleAllowedId,
    removeRuntimeModuleAllowedId,
} from './manifest';
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
    addRuntimeModuleAllowedId(plugin.id);
    for (const module of plugin.modules) {
        addRuntimeModuleAllowedId(module.feature.id);
    }
    dynamicPlugins.set(plugin.id, plugin);
    notify();
}

export function unregisterDynamicFeaturePlugin(pluginId: string): void {
    const existing = dynamicPlugins.get(pluginId);
    if (!dynamicPlugins.delete(pluginId)) return;
    removeRuntimeModuleAllowedId(pluginId);
    if (existing) {
        for (const module of existing.modules) {
            removeRuntimeModuleAllowedId(module.feature.id);
        }
    }
    notify();
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
