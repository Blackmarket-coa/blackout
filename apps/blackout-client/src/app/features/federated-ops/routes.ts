import type { FeatureRoute } from '../../core/features/types';
import { FederationHealthPage } from './FederationHealthPage';
import { RevenueOpsPage } from './RevenueOpsPage';
import { TownhallPage } from './TownhallPage';

export const federationHealthRoutes: FeatureRoute[] = [
    { path: '/ops/federation', component: FederationHealthPage },
];

export const townhallRoutes: FeatureRoute[] = [
    { path: '/ops/townhall', component: TownhallPage },
];

export const revenueOpsRoutes: FeatureRoute[] = [
    { path: '/ops/revenue', component: RevenueOpsPage },
];
