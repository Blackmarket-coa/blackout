import { describe, expect, it } from 'vitest';
import {
    FEDERATED_OPS_EVENT_NAMES,
    isFederationAlertStatus,
    isRevenueOpsSnapshot,
    isTownhallLifecycle,
    type FederationAlertStatusEvent,
    type RevenueOpsSnapshotEvent,
    type TownhallLifecycleEvent,
} from '@blackout/protocol';
import {
    applyTownhallLifecycle,
    compareFederationSeverity,
    createFederatedOpsActions,
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

describe('@blackout/protocol federated-ops event guards (BKL-010)', () => {
    it('publishes the canonical Matrix event types', () => {
        expect(FEDERATED_OPS_EVENT_NAMES.federationAlertStatus).toBe(
            'co.bmc.federation.alert.status'
        );
        expect(FEDERATED_OPS_EVENT_NAMES.townhallLifecycle).toBe('co.bmc.townhall.lifecycle');
        expect(FEDERATED_OPS_EVENT_NAMES.revenueOpsSnapshot).toBe('co.bmc.revenue.ops.snapshot');
    });

    it('isFederationAlertStatus enforces the severity union', () => {
        const valid: FederationAlertStatusEvent = {
            event: 'blackout.federation.alert.status',
            roomId: '!o:srv',
            senderId: '@bot:srv',
            occurredAt: '2026-04-30T00:00:00.000Z',
            payload: {
                alertId: 'a-1',
                severity: 'critical',
                headline: 'Synapse degraded',
                publishedAt: '2026-04-30T00:00:00.000Z',
                active: true,
            },
        };
        expect(isFederationAlertStatus(valid)).toBe(true);
        expect(
            isFederationAlertStatus({
                ...valid,
                payload: { ...valid.payload, severity: 'rogue' },
            })
        ).toBe(false);
    });

    it('isTownhallLifecycle enforces the phase union', () => {
        const valid: TownhallLifecycleEvent = {
            event: 'blackout.townhall.lifecycle',
            roomId: '!o:srv',
            senderId: '@bot:srv',
            occurredAt: '2026-04-30T00:00:00.000Z',
            payload: {
                townhallId: 'th-1',
                phase: 'live',
                topic: 'Q1 review',
                occurredAt: '2026-04-30T00:00:00.000Z',
            },
        };
        expect(isTownhallLifecycle(valid)).toBe(true);
        expect(
            isTownhallLifecycle({ ...valid, payload: { ...valid.payload, phase: 'rogue' } })
        ).toBe(false);
    });

    it('isRevenueOpsSnapshot validates the figures shape', () => {
        const valid: RevenueOpsSnapshotEvent = {
            event: 'blackout.revenue.ops.snapshot',
            roomId: '!o:srv',
            senderId: '@bot:srv',
            occurredAt: '2026-04-30T00:00:00.000Z',
            payload: {
                snapshotId: 's-1',
                capturedAt: '2026-04-30T00:00:00.000Z',
                currency: 'USD',
                figures: { gross: '1000', net: '900', refunds: '50', chargebacks: '50' },
            },
        };
        expect(isRevenueOpsSnapshot(valid)).toBe(true);
        expect(
            isRevenueOpsSnapshot({ ...valid, payload: { ...valid.payload, figures: undefined } })
        ).toBe(false);
    });
});

describe('@blackout/sdk createFederatedOpsActions', () => {
    it('listAlerts + acknowledgeAlert hit the canonical paths', async () => {
        const { apiClient, calls } = buildClient({ subject: '@a:srv', alerts: [] });
        const actions = createFederatedOpsActions(apiClient);

        await actions.listAlerts();
        expect(calls.at(-1)).toEqual({ method: 'GET', path: '/v1/federation/alerts' });

        await actions.acknowledgeAlert('alert 9');
        expect(calls.at(-1)).toEqual({
            method: 'POST',
            path: `/v1/federation/alerts/${encodeURIComponent('alert 9')}/acknowledge`,
            body: {},
        });
    });

    it('listTownhalls + transitionTownhall encode segments and forward inputs', async () => {
        const { apiClient, calls } = buildClient({ subject: '@a:srv', townhalls: [] });
        const actions = createFederatedOpsActions(apiClient);

        await actions.listTownhalls();
        expect(calls.at(-1)).toEqual({ method: 'GET', path: '/v1/townhalls' });

        await actions.transitionTownhall('th-1', { phase: 'live' });
        expect(calls.at(-1)?.body).toEqual({ phase: 'live' });

        await actions.transitionTownhall('th-1', {
            phase: 'cancelled',
            cancellationReason: 'venue closed',
        });
        expect(calls.at(-1)?.body).toEqual({
            phase: 'cancelled',
            cancellationReason: 'venue closed',
        });
    });

    it('strips cancellationReason on non-cancelled transitions', async () => {
        const { apiClient, calls } = buildClient({} as TownhallLifecycleEvent);
        const actions = createFederatedOpsActions(apiClient);

        await actions.transitionTownhall('th-1', {
            phase: 'archived',
            cancellationReason: 'should drop',
        });
        expect(calls.at(-1)?.body).toEqual({ phase: 'archived' });
    });

    it('listRevenueSnapshots paginates with cursor + limit, dropping non-positive limits', async () => {
        const { apiClient, calls } = buildClient({ subject: '@a:srv', snapshots: [] });
        const actions = createFederatedOpsActions(apiClient);

        await actions.listRevenueSnapshots();
        expect(calls.at(-1)?.path).toBe('/v1/revenue/ops/snapshots');

        await actions.listRevenueSnapshots({ cursor: 'c 1', limit: 10 });
        expect(calls.at(-1)?.path).toBe(
            `/v1/revenue/ops/snapshots?cursor=${encodeURIComponent('c 1')}&limit=10`
        );

        await actions.listRevenueSnapshots({ limit: 0 });
        expect(calls.at(-1)?.path).toBe('/v1/revenue/ops/snapshots');

        await actions.listRevenueSnapshots({ limit: -5 });
        expect(calls.at(-1)?.path).toBe('/v1/revenue/ops/snapshots');
    });

    it('publishRevenueSnapshot POSTs the supplied payload', async () => {
        const { apiClient, calls } = buildClient({} as RevenueOpsSnapshotEvent);
        const actions = createFederatedOpsActions(apiClient);
        await actions.publishRevenueSnapshot({
            currency: 'USD',
            figures: { gross: '1000', net: '900', refunds: '50', chargebacks: '50' },
        });
        expect(calls.at(-1)?.path).toBe('/v1/revenue/ops/snapshots');
        expect((calls.at(-1)?.body as { currency: string }).currency).toBe('USD');
    });
});

describe('compareFederationSeverity', () => {
    it('orders critical → warning → info', () => {
        expect(compareFederationSeverity('critical', 'warning')).toBeLessThan(0);
        expect(compareFederationSeverity('warning', 'info')).toBeLessThan(0);
        expect(compareFederationSeverity('critical', 'info')).toBeLessThan(0);
        expect(compareFederationSeverity('info', 'info')).toBe(0);
    });
});

describe('applyTownhallLifecycle', () => {
    it('returns the same reference on townhallId mismatch', () => {
        const snapshot = {
            townhallId: 'a',
            phase: 'live' as const,
            topic: 'Q1',
            occurredAt: '2026-04-30T00:00:00.000Z',
        };
        const update = {
            townhallId: 'b',
            phase: 'archived' as const,
            topic: 'Q1',
            occurredAt: '2026-04-30T00:00:00.000Z',
        };
        expect(applyTownhallLifecycle(snapshot, update)).toBe(snapshot);
    });

    it('merges fields when townhallId matches', () => {
        const snapshot = {
            townhallId: 'a',
            phase: 'scheduled' as const,
            topic: 'Q1',
            occurredAt: '2026-04-30T00:00:00.000Z',
        };
        const update = {
            townhallId: 'a',
            phase: 'live' as const,
            topic: 'Q1',
            occurredAt: '2026-04-30T01:00:00.000Z',
        };
        const merged = applyTownhallLifecycle(snapshot, update);
        expect(merged.phase).toBe('live');
        expect(merged.occurredAt).toBe('2026-04-30T01:00:00.000Z');
    });
});
