import { buildFeatureRegistry } from './buildRegistry';
import { coreFeatureModules } from './coreModules';
import { defaultFeatureFlags } from './featureFlags';
import { assertFeatureModulesRegistered } from './composition';
import { featurePlugins } from './plugins';

/**
 * Freeze snapshot for PR-1 guardrails.
 *
 * Any new feature module ID must be added here before being injected by core modules or plugins.
 */
export const registeredFeatureModuleIds = [
    'governance',
    'forum',
    'deaddrop',
    'moderation',
] as const;

assertFeatureModulesRegistered(coreFeatureModules, registeredFeatureModuleIds, 'core');
assertFeatureModulesRegistered(
    featurePlugins.flatMap((plugin) => plugin.modules),
    registeredFeatureModuleIds,
    'plugin'
);

export const featureRegistry = buildFeatureRegistry(defaultFeatureFlags, featurePlugins);
