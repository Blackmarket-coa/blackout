import type { Hono } from 'hono';
import { governanceModule } from './governance';
import { forumModule } from './forum';
import { deaddropModule } from './deaddrop';
import { deadmanModule } from './deadman';
import { moderationModule } from './moderation';
import { streamingModule } from './streaming';
import { discoveryModule } from './discovery';
import { profileModule } from './profile';
import { stegoModule } from './stego';
import { topicsModule } from './topics';
import type { FeatureModule } from './types';

export const featureModules: FeatureModule[] = [
  governanceModule,
  forumModule,
  deaddropModule,
  deadmanModule,
  moderationModule,
  streamingModule,
  discoveryModule,
  profileModule,
  stegoModule,
  topicsModule,
];

export function registerFeatureModules(app: Hono, apiRoot: string): void {
  for (const featureModule of featureModules) {
    app.route(`${apiRoot}${featureModule.mountPath}`, featureModule.registerRoutes());
  }
}
