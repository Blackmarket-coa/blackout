import type { BlackoutFeature } from '../../core/features/types';
import { authOidcPanels, threadActivityPanels } from './panels';
import { authOidcRoutes, threadActivityRoutes } from './routes';
import { authOidcSettings, threadActivitySettings } from './settings';

/**
 * Auth (OIDC) + thread-activity feature module — BKL-011.
 *
 * Two customizations gated by separate capabilities so admins can grant
 * delegated-login bootstrap without exposing the activity inbox (and
 * vice versa):
 *   - `auth-oidc`         gated by `auth.oidc.bootstrap`
 *   - `thread-activity`   gated by `threads.activity.read`
 *
 * Both ride behind the `authThreads` flag so the canonical shell stays
 * unchanged until operators opt in.
 *
 * Mirrors `web.feature.auth_oidc` and `legacy.config.threads_activity`.
 */
export const authThreadsFeature: BlackoutFeature = {
    id: 'auth-threads',
    name: 'Auth & Threads',
    customizations: [
        {
            id: 'auth-oidc',
            name: 'OIDC Delegated Login',
            category: 'service-backed plugin',
            capabilityGate: {
                allOf: ['auth.oidc.bootstrap'],
                flags: ['authThreads'],
            },
            routes: authOidcRoutes,
            panels: authOidcPanels,
            settings: authOidcSettings,
        },
        {
            id: 'thread-activity',
            name: 'Thread Activity Inbox',
            category: 'workflow plugin',
            capabilityGate: {
                allOf: ['threads.activity.read'],
                flags: ['authThreads'],
            },
            routes: threadActivityRoutes,
            panels: threadActivityPanels,
            settings: threadActivitySettings,
        },
    ],
    capabilities: ['auth.oidc.bootstrap', 'threads.activity.read'],
};
