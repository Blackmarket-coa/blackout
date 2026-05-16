import type { FeatureSettingsItem } from '../../core/features/types';
import { LabsPage } from './LabsPage';
import { PreferencesPage } from './PreferencesPage';
import { SidebarPage } from './SidebarPage';

/**
 * Settings sections for BKL-007 — Preferences / Sidebar / Labs surfaces.
 *
 * Port 5 (BKL-001 / Workstream A) rewires these so the canonical
 * settings IA renders the real `PreferencesPage` / `SidebarPage` /
 * `LabsPage` components rather than the prior placeholders.
 *
 * Each page self-sources its fetcher via `useRegistryFetcher(...)`
 * (`'preferences'` / `'sidebarSettings'` / `'labs'`) with a no-op stub
 * fallback so the section still renders when the registry fetcher is
 * not wired (e.g. in the IA navigation test).
 */
export const preferencesSettings: FeatureSettingsItem[] = [
    {
        section: 'Preferences',
        component: PreferencesPage,
    },
];

export const sidebarSettings: FeatureSettingsItem[] = [
    {
        section: 'Sidebar',
        component: SidebarPage,
    },
];

/**
 * The Labs section is gated twice:
 * - The registry checks the `settings.labs.show` capability + the
 *   `settingsParity` flag (manifest.ts) before composing this entry
 *   at all.
 * - Inside `LabsPage`, `resolveLabsGate({ configFlag, developerMode })`
 *   from `@blackout/sdk` hides the feature list when neither
 *   `configFlag` nor `developerMode` is true. Per-user developer mode
 *   is fetched via `fetcher.fetchLabsGate()` on mount.
 */
export const labsSettings: FeatureSettingsItem[] = [
    {
        section: 'Labs',
        component: LabsPage,
    },
];