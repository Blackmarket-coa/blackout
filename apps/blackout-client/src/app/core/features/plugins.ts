import type { FeatureModulePlugin } from './types';

/**
 * Plugin boundary: feature module plugins must be registered in
 * `featureModulePluginManifest` and `featureModuleManifest` before being added.
 */
export const featurePlugins: FeatureModulePlugin[] = [];
