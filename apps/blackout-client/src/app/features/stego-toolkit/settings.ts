import { createElement } from 'react';
import type { FeatureSettingsItem } from '../../core/features/types';

const buildPlaceholderSection = (title: string, body: string) =>
    function StegoToolkitSettingsSection() {
        return createElement(
            'section',
            { style: { padding: 12 } },
            createElement('h2', null, title),
            createElement('p', null, body)
        );
    };

/**
 * Settings sections introduced for BKL-005 — toolkit + ephemeral lifecycle
 * preferences. The dedicated steganography settings tab parity (BKL-008)
 * will compose against these same sections via the shared module exports.
 */
export const stegoToolkitSettings: FeatureSettingsItem[] = [
    {
        section: 'Stego / Toolkit',
        component: buildPlaceholderSection(
            'Stego · Toolkit',
            'Default carrier, passphrase strength policy, and channel directory. Backed by `listChannels` / `createChannel` SDK actions.'
        ),
    },
];

export const ephemeralStegoLifecycleSettings: FeatureSettingsItem[] = [
    {
        section: 'Stego / Ephemeral lifecycle',
        component: buildPlaceholderSection(
            'Stego · Ephemeral lifecycle',
            'Default ephemeral mode, TTL window, rotation cadence, and revocation policy. Backed by `rotateChannel` / `expireChannel` and `computeStegoExpiryAt`.'
        ),
    },
];
