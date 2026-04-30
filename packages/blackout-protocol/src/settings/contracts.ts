/**
 * User settings + labs gating contracts (BKL-007).
 *
 * Mirrors the `_port` user-settings surface (preferences / sidebar / labs)
 * lifted into a typed protocol so canonical and legacy hosts agree on the
 * scope/category/value shape for change-event propagation across runtimes.
 */

import type { EventEnvelope } from '../common/types';

export const SETTINGS_PROTOCOL_VERSION = 1 as const;

export const SETTINGS_EVENT_NAMES = {
    settingChanged: 'co.bmc.settings.changed',
    labsGateChanged: 'co.bmc.settings.labs.gate.changed',
} as const;

export type SettingsEventName =
    (typeof SETTINGS_EVENT_NAMES)[keyof typeof SETTINGS_EVENT_NAMES];

/**
 * Three canonical settings categories. Matches the `_port` tab taxonomy:
 *
 * - `preferences` — language, autocomplete, read-marker thresholds, …
 * - `sidebar`     — meta-space toggles (Home/Favourites/People/Orphans/VideoRooms).
 * - `labs`        — experimental feature flags, gated by `legacy.config.labs_gate`.
 */
export type SettingsCategory = 'preferences' | 'sidebar' | 'labs';

/**
 * Canonical scope. `device` mirrors `_port`'s `LEVELS_DEVICE_ONLY_SETTINGS`
 * (per-install only); `account` mirrors `SettingLevel.ACCOUNT` (synced via
 * the homeserver). Receivers should treat unknown scopes as `device`.
 */
export type SettingsScope = 'device' | 'account';

/**
 * JSON-serializable value. Receivers MUST validate before using;
 * canonical client adds a category-specific schema check before commit.
 */
export type SettingsValue = string | number | boolean | null | SettingsValue[] | { [key: string]: SettingsValue };

export interface SettingChangedPayload {
    /** Settings category the changed key belongs to. */
    category: SettingsCategory;
    /** Stable key id (e.g. `language`, `Spaces.enabledMetaSpaces.Home`, `labs.feature_x`). */
    key: string;
    /** Persistence scope. */
    scope: SettingsScope;
    /** New value the user committed. `null` clears the override. */
    value: SettingsValue;
    /** ISO-8601 timestamp the change was committed. */
    changedAt: string;
}

/**
 * Reason the labs gate flipped. Mirrors `_port`'s
 * `SdkConfig.get('show_labs_settings') || developerMode`: the gate is the
 * OR of an admin-config-driven flag and a per-user developerMode toggle.
 */
export type LabsGateReason = 'config_flag' | 'developer_mode';

export interface LabsGateChangedPayload {
    /** Whether the labs tab should be visible after this change. */
    visible: boolean;
    /** Why visibility flipped. */
    reason: LabsGateReason;
    /** ISO-8601 timestamp the gate change took effect. */
    changedAt: string;
}

export type SettingChangedEvent = EventEnvelope<
    'blackout.settings.changed',
    SettingChangedPayload
>;

export type LabsGateChangedEvent = EventEnvelope<
    'blackout.settings.labs.gate.changed',
    LabsGateChangedPayload
>;
