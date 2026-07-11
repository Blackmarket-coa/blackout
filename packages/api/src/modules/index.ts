import type { Hono } from 'hono';
import { governanceModule } from './governance';
import { channelsModule } from './channels';
import { forumModule } from './forum';
import { deaddropModule } from './deaddrop';
import { deadmanModule } from './deadman';
import { moderationModule } from './moderation';
import { moderationMjolnirModule } from './moderationMjolnir';
import { streamingModule } from './streaming';
import { discoveryModule } from './discovery';
import { profileModule } from './profile';
import { stegoModule } from './stego';
import { topicsModule } from './topics';
import { growthModule } from './growth';
import { searchModule } from './search';
import type { FeatureModule } from './types';

export const featureModules: FeatureModule[] = [
    governanceModule,
    channelsModule,
    forumModule,
    deaddropModule,
    deadmanModule,
    moderationModule,
    moderationMjolnirModule,
    streamingModule,
    discoveryModule,
    profileModule,
    stegoModule,
    topicsModule,
    growthModule,
    searchModule,
];

export function registerFeatureModules(app: Hono, apiRoot: string): void {
    for (const featureModule of featureModules) {
        app.route(`${apiRoot}${featureModule.mountPath}`, featureModule.registerRoutes());
    }
}
