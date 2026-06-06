import type { Hono } from 'hono';

export type FeatureModuleId =
  | 'governance'
  | 'channels'
  | 'forum'
  | 'deaddrop'
  | 'deadman'
  | 'moderation'
  | 'streaming'
  | 'discovery'
  | 'profile'
  | 'stego'
  | 'topics'
  | 'growth'
  | 'search';

export interface FeatureModule {
  id: FeatureModuleId;
  mountPath: `/${FeatureModuleId}`;
  registerRoutes: () => Hono;
}
