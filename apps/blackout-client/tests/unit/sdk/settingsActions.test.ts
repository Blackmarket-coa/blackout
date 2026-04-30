import { describe, expect, it } from 'vitest';
import {
    isLabsGateChanged,
    isSettingChanged,
    SETTINGS_EVENT_NAMES,
    type LabsGateChangedEvent,
    type SettingChangedEvent,
} from '@blackout/protocol';
import {
    applySettingChange,
    createSettingsActions,
    resolveLabsGate,
    type SettingsBucket,
} from '@blackout/sdk';
import type { ApiClient, ApiRequest } from '@blackout/sdk';

const buildClient = <T>(response: T) => {
    const calls: ApiRequest[] = [];
    const apiClient: ApiClient = async (request) => {
        calls.push(request);
        return response as never;
    };
    return { apiClient, calls };
};

describe('@blackout/protocol settings event guards (BKL-007)', () => {
    it('publishes the canonical Matrix event types', () => {
        expect(SETTINGS_EVENT_NAMES.settingChanged).toBe('co.bmc.settings.changed');
        expect(SETTINGS_EVENT_NAMES.labsGateChanged).toBe('co.bmc.settings.labs.gate.changed');
    });

    it('isSettingChanged narrows valid envelopes and enforces unions', () => {
        const valid: SettingChangedEvent = {
            event: 'blackout.settings.changed',
            roomId: '!s:srv',
            senderId: '@a:srv',
            occurredAt: '2026-04-30T00:00:00.000Z',
            payload: {
                category: 'preferences',
                key: 'language',
                scope: 'device',
                value: 'en-US',
                changedAt: '2026-04-30T00:00:00.000Z',
            },
        };
        expect(isSettingChanged(valid)).toBe(true);
        expect(
            isSettingChanged({ ...valid, payload: { ...valid.payload, category: 'rogue' } })
        ).toBe(false);
        expect(
            isSettingChanged({ ...valid, payload: { ...valid.payload, scope: 'rogue' } })
        ).toBe(false);
        expect(isLabsGateChanged(valid)).toBe(false);
    });

    it('isLabsGateChanged narrows valid envelopes and enforces reason union', () => {
        const valid: LabsGateChangedEvent = {
            event: 'blackout.settings.labs.gate.changed',
            roomId: '!s:srv',
            senderId: '@a:srv',
            occurredAt: '2026-04-30T00:00:00.000Z',
            payload: {
                visible: true,
                reason: 'config_flag',
                changedAt: '2026-04-30T00:00:00.000Z',
            },
        };
        expect(isLabsGateChanged(valid)).toBe(true);
        expect(
            isLabsGateChanged({ ...valid, payload: { ...valid.payload, reason: 'rogue' } })
        ).toBe(false);
    });
});

describe('@blackout/sdk createSettingsActions', () => {
    it('fetchBucket encodes scope + category', async () => {
        const { apiClient, calls } = buildClient({
            subject: '@a:srv',
            bucket: { scope: 'device', category: 'preferences', values: {} },
        });
        const actions = createSettingsActions(apiClient);

        await actions.fetchBucket('device', 'preferences');
        expect(calls.at(-1)).toEqual({
            method: 'GET',
            path: '/v1/settings/device/preferences',
        });
    });

    it('setSetting encodes path segments and forwards the value', async () => {
        const { apiClient, calls } = buildClient<SettingChangedEvent>(
            {} as SettingChangedEvent
        );
        const actions = createSettingsActions(apiClient);

        await actions.setSetting('account', 'sidebar', 'Spaces.enabledMetaSpaces.Home', true);
        expect(calls.at(-1)).toEqual({
            method: 'PUT',
            path: `/v1/settings/account/sidebar/${encodeURIComponent('Spaces.enabledMetaSpaces.Home')}`,
            body: { value: true },
        });

        await actions.setSetting('device', 'preferences', 'language', null);
        expect(calls.at(-1)?.body).toEqual({ value: null });
    });

    it('fetchLabsFeatures + setLabsFeatureEnabled hit the labs paths', async () => {
        const { apiClient, calls } = buildClient({ subject: '@a:srv', features: [] });
        const actions = createSettingsActions(apiClient);

        await actions.fetchLabsFeatures();
        expect(calls.at(-1)).toEqual({
            method: 'GET',
            path: '/v1/settings/labs/features',
        });

        await actions.setLabsFeatureEnabled('feature_x.with space', true);
        expect(calls.at(-1)).toEqual({
            method: 'PUT',
            path: `/v1/settings/labs/features/${encodeURIComponent('feature_x.with space')}`,
            body: { enabled: true },
        });
    });

    it('fetchLabsGate + setDeveloperMode hit the gate paths', async () => {
        const { apiClient, calls } = buildClient({
            visible: true,
            reason: 'config_flag',
            breakdown: { configFlag: true, developerMode: false },
        });
        const actions = createSettingsActions(apiClient);

        await actions.fetchLabsGate();
        expect(calls.at(-1)).toEqual({
            method: 'GET',
            path: '/v1/settings/labs/gate',
        });

        await actions.setDeveloperMode(true);
        expect(calls.at(-1)).toEqual({
            method: 'PUT',
            path: '/v1/settings/labs/developer-mode',
            body: { enabled: true },
        });
    });
});

describe('resolveLabsGate', () => {
    it('returns visible=false when neither input is set', () => {
        expect(resolveLabsGate({ configFlag: false, developerMode: false })).toEqual({
            visible: false,
            reason: 'developer_mode',
            breakdown: { configFlag: false, developerMode: false },
        });
    });

    it('prefers config_flag when both inputs are set', () => {
        expect(resolveLabsGate({ configFlag: true, developerMode: true })).toEqual({
            visible: true,
            reason: 'config_flag',
            breakdown: { configFlag: true, developerMode: true },
        });
    });

    it('falls back to developer_mode when only the per-user toggle enables visibility', () => {
        expect(resolveLabsGate({ configFlag: false, developerMode: true })).toEqual({
            visible: true,
            reason: 'developer_mode',
            breakdown: { configFlag: false, developerMode: true },
        });
    });
});

describe('applySettingChange', () => {
    const bucket: SettingsBucket = {
        scope: 'device',
        category: 'preferences',
        values: { language: 'en-US', autocompleteDelay: 200 },
    };

    it('upserts a key when scope + category match', () => {
        const next = applySettingChange(bucket, {
            scope: 'device',
            category: 'preferences',
            key: 'language',
            value: 'es-ES',
        });
        expect(next.values.language).toBe('es-ES');
        expect(next.values.autocompleteDelay).toBe(200);
        expect(next).not.toBe(bucket);
    });

    it('clears a key when value is null (revert to default)', () => {
        const next = applySettingChange(bucket, {
            scope: 'device',
            category: 'preferences',
            key: 'language',
            value: null,
        });
        expect(next.values).not.toHaveProperty('language');
        expect(next.values.autocompleteDelay).toBe(200);
    });

    it('returns the same bucket reference when scope or category mismatches', () => {
        expect(
            applySettingChange(bucket, {
                scope: 'account',
                category: 'preferences',
                key: 'language',
                value: 'es-ES',
            })
        ).toBe(bucket);
        expect(
            applySettingChange(bucket, {
                scope: 'device',
                category: 'sidebar',
                key: 'language',
                value: 'es-ES',
            })
        ).toBe(bucket);
    });
});
