import { createElement } from 'react';
import type { FeatureSettingsItem } from '../../core/features/types';

const EducationSettingsSection = () =>
    createElement(
        'section',
        { style: { padding: 12 } },
        createElement('h2', null, 'Education'),
        createElement(
            'p',
            null,
            'Default reading pace + reminder cadence. Backed by the BKL-012 education SDK and the `blackout.education.module.progress` envelope.'
        )
    );

export const educationSettings: FeatureSettingsItem[] = [
    {
        section: 'Education',
        component: EducationSettingsSection,
    },
];
