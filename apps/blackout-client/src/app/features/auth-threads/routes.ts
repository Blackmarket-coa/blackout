import type { FeatureRoute } from '../../core/features/types';
import { AuthDelegatedLoginPage } from './AuthDelegatedLoginPage';
import { ThreadActivityPage } from './ThreadActivityPage';

export const authOidcRoutes: FeatureRoute[] = [
    { path: '/auth/oidc', component: AuthDelegatedLoginPage },
];

export const threadActivityRoutes: FeatureRoute[] = [
    { path: '/inbox/threads', component: ThreadActivityPage },
];
