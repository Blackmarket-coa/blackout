import { createElement } from 'react';
import type { FeatureRoute } from '../../core/features/types';
import { DialpadForm } from './DialpadForm';
import { MediaUploadWidget } from './MediaUploadWidget';

const ElementCallRoutePage = () =>
    createElement(
        'main',
        { style: { padding: 16 } },
        createElement('h1', null, 'Element Call'),
        createElement(
            'p',
            null,
            'Element Call launcher placeholder. Backed by `launchCall` (kind: `element-call`) and `getCallBootstrap` SDK actions.'
        )
    );

export const mediaPipelineRoutes: FeatureRoute[] = [
    { path: '/media/uploads', component: MediaUploadWidget },
];

export const callDialpadRoutes: FeatureRoute[] = [
    { path: '/call/dialpad', component: DialpadForm },
];

export const callElementRoutes: FeatureRoute[] = [
    { path: '/call/element', component: ElementCallRoutePage },
];
