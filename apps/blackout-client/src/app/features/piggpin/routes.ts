import { createElement } from 'react';
import type { FeatureRoute } from '../../core/features/types';
import { PiggPinView } from './PiggPinView';

const PiggPinRoutePage = () => createElement(PiggPinView);

export const piggpinRoutes: FeatureRoute[] = [
    { path: '/coalition/map', component: PiggPinRoutePage },
];
