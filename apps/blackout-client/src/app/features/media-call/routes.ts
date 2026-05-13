import type { FeatureRoute } from '../../core/features/types';
import { DialpadForm } from './DialpadForm';
import { ElementCallLauncher } from './ElementCallLauncher';
import { MediaUploadWidget } from './MediaUploadWidget';

export const mediaPipelineRoutes: FeatureRoute[] = [
    { path: '/media/uploads', component: MediaUploadWidget },
];

export const callDialpadRoutes: FeatureRoute[] = [
    { path: '/call/dialpad', component: DialpadForm },
];

export const callElementRoutes: FeatureRoute[] = [
    { path: '/call/element', component: ElementCallLauncher },
];
