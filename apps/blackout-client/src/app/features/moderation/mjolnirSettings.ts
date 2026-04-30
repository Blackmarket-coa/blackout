import { createElement } from 'react';
import type { FeatureSettingsItem } from '../../core/features/types';

const MjolnirSettingsSection = () =>
    createElement(
        'section',
        { style: { padding: 12 } },
        createElement('h2', null, 'Mjolnir moderation'),
        createElement(
            'p',
            null,
            'Personal banlist rules, list subscriptions, and protection toggles. Backed by the BKL-009 mjolnir SDK + protection-state events.'
        )
    );

/**
 * Mjolnir moderation settings section — BKL-009 parity with `_port`'s
 * `MjolnirUserSettingsTab`. Placeholder pending the canonical settings IA
 * rewire shared with BKL-007.
 */
export const mjolnirSettingsItems: FeatureSettingsItem[] = [
    {
        section: 'Moderation / Mjolnir',
        component: MjolnirSettingsSection,
    },
];
