import type { Hono } from 'hono';
import { governanceModule } from './governance';
import { forumModule } from './forum';
import { deaddropModule } from './deaddrop';
import { moderationModule } from './moderation';
import type { FeatureModule } from './types';

export const featureModules: FeatureModule[] = [governanceModule, forumModule, deaddropModule, moderationModule];

export function registerFeatureModules(app: Hono, apiRoot: string): void {
  for (const featureModule of featureModules) {
    app.route(`${apiRoot}${featureModule.mountPath}`, featureModule.registerRoutes());
  }
}
