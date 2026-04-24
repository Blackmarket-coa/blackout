import type { Hono } from 'hono';

export type FeatureModuleId = 'governance' | 'forum' | 'deaddrop' | 'moderation' | 'streaming' | 'discovery';

export interface FeatureModule {
  id: FeatureModuleId;
  mountPath: `/${FeatureModuleId}`;
  registerRoutes: () => Hono;
}
