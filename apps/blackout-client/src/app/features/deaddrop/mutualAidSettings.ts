import { createElement } from 'react';
import type { FeatureSettingsItem } from '../../core/features/types';

const MutualAidSettingsSection = () =>
    createElement(
        'section',
        { style: { padding: 12 } },
        createElement('h2', null, 'Mutual aid'),
        createElement(
            'p',
            null,
            'Notification preferences for new mutual-aid threads + helper invites. Backed by the BKL-013 mutual-aid SDK.'
        )
    );

export const mutualAidSettings: FeatureSettingsItem[] = [
    {
        section: 'Mutual aid',
        component: MutualAidSettingsSection,
    },
];
