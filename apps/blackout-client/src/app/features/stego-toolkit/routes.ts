import { createElement } from 'react';
import type { FeatureRoute } from '../../core/features/types';

const StegoToolkitRoutePage = () =>
    createElement(
        'main',
        { style: { padding: 16 } },
        createElement('h1', null, 'Stego Toolkit'),
        createElement(
            'p',
            null,
            'Channel manager + composer placeholder. Backed by `listChannels` / `createChannel` / `fetchChannel` SDK actions and `blackout.stego.channel.created` events.'
        )
    );

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
    { path: '/stego/channels', component: StegoToolkitRoutePage },
];

export const ephemeralStegoLifecycleRoutes: FeatureRoute[] = [
    { path: '/stego/channels/lifecycle', component: EphemeralLifecycleRoutePage },
];
