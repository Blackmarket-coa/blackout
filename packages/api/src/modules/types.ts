import type { Hono } from 'hono';

export type FeatureModuleId =
  | 'governance'
  | 'forum'
  | 'deaddrop'
  | 'deadman'
  | 'moderation'
  | 'streaming'
  | 'discovery'
  | 'profile'
  | 'stego'
  | 'topics'
  | 'growth';

export interface FeatureModule {
  id: FeatureModuleId;
  mountPath: `/${FeatureModuleId}`;
  registerRoutes: () => Hono;
}
