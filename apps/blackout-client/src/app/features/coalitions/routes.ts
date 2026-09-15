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
];
