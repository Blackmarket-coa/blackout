import { createElement } from 'react';
import type { FeatureSettingsItem } from '../../core/features/types';

/**
 * Placeholder pane for the mutual-aid section.
 *
 * The previous copy advertised "notification preferences for new mutual-aid
 * threads + helper invites". Neither exists: there are no notification
 * preferences here, and no helper-invite mechanism anywhere in the repo —
 * `MutualAidThreadPayload` has no field for a helper and its status enum
 * cannot record who responded. Describing unbuilt features to anyone who
 * opens Settings is worse than saying there is nothing here yet.
 */
const MutualAidSettingsSection = () =>
    createElement(
        'section',
        { style: { padding: 12 } },
        createElement('h2', null, 'Mutual aid'),
        createElement(
            'p',
            null,
            'Nothing to configure yet. Mutual-aid threads live in the dead-drop surface; when this pane gains settings they will appear here.'
        )
    );

export const mutualAidSettings: FeatureSettingsItem[] = [
    {
        section: 'Mutual aid',
        component: MutualAidSettingsSection,
    },
];
