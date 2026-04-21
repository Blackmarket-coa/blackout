import { createElement } from 'react';

const bulletListStyle = {
    margin: 0,
    paddingInlineStart: 18,
    display: 'grid',
    gap: 4,
};

export const SubscriptionsSlice = () =>
    createElement(
        'section',
        { style: { display: 'grid', gap: 10 } },
        createElement(
            'p',
            { style: { margin: 0, color: 'var(--text-secondary)' } },
            'Manage tiered plans, contextual upgrade prompts, and attachable add-ons from one flow.',
        ),
        createElement(
            'ul',
            { style: bulletListStyle },
            createElement('li', undefined, 'Plan matrix with monthly/yearly pricing and feature gates'),
            createElement('li', undefined, 'Upgrade prompts for members approaching limits'),
            createElement('li', undefined, 'Add-on packs for analytics, storage, and team seats'),
        ),
    );
