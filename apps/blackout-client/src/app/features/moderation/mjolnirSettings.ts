import type { FeatureSettingsItem } from '../../core/features/types';
import { MjolnirSettingsPage } from './MjolnirSettingsPage';

/**
 * Mjolnir moderation settings section — BKL-009. Port 5 (BKL-001 /
 * Workstream A) rewires this entry so the canonical settings IA
 * renders the real `MjolnirSettingsPage` (banlist rules + protection
 * toggles) rather than the prior placeholder.
 *
 * The page self-sources its fetcher via `useRegistryFetcher('mjolnir')`
 * with an empty stub fallback. The section name preserves the
 * `Moderation / Mjolnir` prefix so the IA can later infer a
 * "Moderation" group from the segment before the separator without a
 * data-shape migration.
 */
export const mjolnirSettingsItems: FeatureSettingsItem[] = [
    {
        section: 'Moderation / Mjolnir',
        component: MjolnirSettingsPage,
    },
];