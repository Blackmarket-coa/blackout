import { createElement } from 'react';
import type { FeatureRoute } from '../../core/features/types';
import CoalitionsHub from './CoalitionsHub';
import CoalitionPage from './CoalitionPage';

export const COALITIONS_PATH = '/coalitions';

const CoalitionsHubRoutePage = () => createElement(CoalitionsHub, {});
const CoalitionRoutePage = () => createElement(CoalitionPage, {});

export const coalitionsRoutes: FeatureRoute[] = [
    { path: COALITIONS_PATH, component: CoalitionsHubRoutePage },
    { path: `${COALITIONS_PATH}/:id`, component: CoalitionRoutePage },
    // Campaign deep link. Every shared campaign URL redirects here, so without
    // this route the OG card promises a campaign and the destination shows a
    // coalition page that never names it.
    { path: `${COALITIONS_PATH}/:id/c/:campaignId`, component: CoalitionRoutePage },
];
