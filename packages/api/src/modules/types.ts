import type { Hono } from 'hono';

export type FeatureModuleId =
    | 'governance'
    | 'channels'
    | 'forum'
    | 'deaddrop'
    | 'deadman'
    | 'moderation'
    | 'moderation/mjolnir'
    | 'streaming'
    | 'discovery'
    | 'profile'
    | 'stego'
    | 'topics'
    | 'growth'
    | 'search'
    | 'feed';

export interface FeatureModule {
    id: FeatureModuleId;
    mountPath: `/${FeatureModuleId}`;
    registerRoutes: () => Hono;
}
