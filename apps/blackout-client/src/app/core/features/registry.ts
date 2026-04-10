import { buildFeatureRegistry } from './buildRegistry';
import { defaultFeatureFlags } from './featureFlags';

export const featureRegistry = buildFeatureRegistry(defaultFeatureFlags);
