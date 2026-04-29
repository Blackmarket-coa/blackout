import { createElement } from 'react';
import type { FeatureSettingsItem } from '../../core/features/types';

const buildPlaceholderSection = (title: string, body: string) =>
    function MediaCallSettingsSection() {
        return createElement(
            'section',
            { style: { padding: 12 } },
            createElement('h2', null, title),
            createElement('p', null, body)
        );
    };

/**
 * Settings sections introduced for BKL-006 — media pipeline + call/dialpad
 * preferences. Placeholders pending the canonical settings shell rewire.
 */
export const mediaPipelineSettings: FeatureSettingsItem[] = [
    {
        section: 'Media / Pipeline',
        component: buildPlaceholderSection(
            'Media · Pipeline',
            'Upload concurrency, transcode quality, and auto-retry policy. Backed by `fetchUploadProgress` / `cancelUpload`.'
        ),
    },
];

export const callSettings: FeatureSettingsItem[] = [
    {
        section: 'Call / Dialpad',
        component: buildPlaceholderSection(
            'Call · Dialpad',
            'Default country code, ringback tone, and PSTN gateway preferences for the dialpad surface.'
        ),
    },
    {
        section: 'Call / Element Call',
        component: buildPlaceholderSection(
            'Call · Element Call',
            'Element Call instance URL and bootstrap mode. Backed by `launchCall` (kind: `element-call`).'
        ),
    },
];
