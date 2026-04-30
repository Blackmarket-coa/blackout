import { createElement } from 'react';
import type { FeatureRoute } from '../../core/features/types';
import { StegoToolkitPage } from './StegoToolkitPage';

const EphemeralLifecycleRoutePage = () =>
    createElement(
        'main',
        { style: { padding: 16 } },
        createElement('h1', null, 'Ephemeral Stego Lifecycle'),
        createElement(
            'p',
            null,
            'Rotate / expire controls for stego channels. Backed by `rotateChannel` / `expireChannel` SDK actions and `blackout.stego.channel.{rotated,expired}` events.'
        )
    );

export const stegoToolkitRoutes: FeatureRoute[] = [
    { path: '/stego/channels', component: StegoToolkitPage },
];

export const ephemeralStegoLifecycleRoutes: FeatureRoute[] = [
    { path: '/stego/channels/lifecycle', component: EphemeralLifecycleRoutePage },
];
