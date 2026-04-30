import type {
    LabsGateChangedEvent,
    LabsGateReason,
    SettingChangedEvent,
    SettingsCategory,
    SettingsScope,
    SettingsValue,
} from '@blackout/protocol';
import type { ApiClient } from '../client/types';

/**
 * Snapshot of every key under a single (scope, category) bucket.
 * Mirrors the shape `_port`'s `SettingsStore.getValueAt(level, key)` would
 * produce when materialized as a single document for the canonical client.
 */
export type SettingsBucket = {
    scope: SettingsScope;
    category: SettingsCategory;
    /** Keys → values, opaque to the SDK. Receivers validate per category. */
    values: Record<string, SettingsValue>;
};

export type SettingsBucketResponse = {
    /** Subject the bucket belongs to (typically the authenticated subject). */
    subject: string;
    bucket: SettingsBucket;
};

export type LabsFeatureDescriptor = {
    /** Stable feature id (`f.<name>` in `_port`'s `FeatureSettingKey`). */
    id: string;
    /** Human-readable label. */
    label: string;
    /** Optional lab-group bucket id (mirrors `_port`'s `LabGroup` enum). */
    group?: string;
    /** Whether the feature is currently enabled for the subject. */
    enabled: boolean;
    /** Whether the feature is in beta (separate render bucket on `_port`). */
    beta?: boolean;
};

export type LabsFeaturesResponse = {
    subject: string;
    features: LabsFeatureDescriptor[];
};

export type LabsGateState = {
    /** Whether the labs tab should currently be visible. */
    visible: boolean;
    /** Most recent reason the gate flipped. */
    reason: LabsGateReason;
    /** Underlying components driving the gate (informational). */
    breakdown: {
        configFlag: boolean;
        developerMode: boolean;
    };
};

export const createSettingsActions = (client: ApiClient) => ({
    /**
     * Fetch the current values for a single (scope, category) bucket.
     * Backed by `GET /v1/settings/:scope/:category`. Returns the full set
     * so the canonical client can replace its local snapshot atomically.
     */
    fetchBucket: (scope: SettingsScope, category: SettingsCategory) =>
        client<SettingsBucketResponse>({
            method: 'GET',
            path: `/v1/settings/${encodeURIComponent(scope)}/${encodeURIComponent(category)}`,
        }),
    /**
     * Upsert a single key. The server emits a `blackout.settings.changed`
     * envelope so other runtimes can apply the delta without polling.
     * Pass `value: null` to clear the override (revert to default).
     */
    setSetting: (
        scope: SettingsScope,
        category: SettingsCategory,
        key: string,
        value: SettingsValue
    ) =>
        client<SettingChangedEvent>({
            method: 'PUT',
            path: `/v1/settings/${encodeURIComponent(scope)}/${encodeURIComponent(category)}/${encodeURIComponent(key)}`,
            body: { value },
        }),
    /**
     * Fetch the labs feature directory plus the current per-feature
     * enablement. Used by the labs tab to render groups + toggles.
     */
    fetchLabsFeatures: () =>
        client<LabsFeaturesResponse>({
            method: 'GET',
            path: '/v1/settings/labs/features',
        }),
    /**
     * Toggle a single labs feature. The server emits a
     * `blackout.settings.changed` envelope (category=`labs`).
     */
    setLabsFeatureEnabled: (featureId: string, enabled: boolean) =>
        client<SettingChangedEvent>({
            method: 'PUT',
            path: `/v1/settings/labs/features/${encodeURIComponent(featureId)}`,
            body: { enabled },
        }),
    /**
     * Resolve the current labs gate visibility from the server (config
     * flag OR per-user developer mode). Returns the breakdown so the
     * canonical client can show "enabled by config" vs "enabled by
     * developer mode" diagnostics.
     */
    fetchLabsGate: () =>
        client<LabsGateState>({
            method: 'GET',
            path: '/v1/settings/labs/gate',
        }),
    /**
     * Flip the per-user developer-mode contribution to the labs gate.
     * Server emits a `blackout.settings.labs.gate.changed` envelope.
     */
    setDeveloperMode: (enabled: boolean) =>
        client<LabsGateChangedEvent>({
            method: 'PUT',
            path: '/v1/settings/labs/developer-mode',
            body: { enabled },
        }),
});

/**
 * Pure helper: resolves the labs gate from its two component inputs.
 * Mirrors `_port/src/components/views/settings/tabs/user/LabsUserSettingsTab.tsx`'s
 * `showLabsFlags()`: visible iff config OR developerMode. The `reason`
 * prefers `config_flag` because it's admin-driven (and explicitly the gate
 * referenced by `legacy.config.labs_gate`); falls back to `developer_mode`
 * when only the per-user toggle is enabling visibility.
 */
export const resolveLabsGate = (input: {
    configFlag: boolean;
    developerMode: boolean;
}): LabsGateState => {
    const visible = input.configFlag || input.developerMode;
    const reason: LabsGateReason = input.configFlag ? 'config_flag' : 'developer_mode';
    return {
        visible,
        reason,
        breakdown: { configFlag: input.configFlag, developerMode: input.developerMode },
    };
};

/**
 * Pure helper: merge a `blackout.settings.changed` envelope into a local
 * bucket snapshot. Returns a new bucket; ignores envelopes whose
 * (scope, category) doesn't match the supplied bucket. `value: null`
 * clears the key (revert to default).
 */
export const applySettingChange = (
    bucket: SettingsBucket,
    payload: { scope: SettingsScope; category: SettingsCategory; key: string; value: SettingsValue }
): SettingsBucket => {
    if (payload.scope !== bucket.scope || payload.category !== bucket.category) {
        return bucket;
    }
    const nextValues = { ...bucket.values };
    if (payload.value === null) {
        delete nextValues[payload.key];
    } else {
        nextValues[payload.key] = payload.value;
    }
    return { ...bucket, values: nextValues };
};

export type {
    LabsGateChangedEvent,
    LabsGateReason,
    SettingChangedEvent,
    SettingsCategory,
    SettingsScope,
    SettingsValue,
};
