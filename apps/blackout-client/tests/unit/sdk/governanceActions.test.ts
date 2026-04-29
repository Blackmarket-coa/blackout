import { describe, expect, it, vi } from 'vitest';
import {
    GOVERNANCE_MEETING_EVENT_TYPE,
    GOVERNANCE_TREASURY_SNAPSHOT_EVENT_TYPE,
    isGovernanceMeetingScheduled,
    isGovernanceTreasurySnapshotPublished,
    isGovernanceVoteCast,
    type GovernanceMeetingScheduled,
    type GovernanceTreasurySnapshotPublished,
} from '@blackout/protocol';
import { createGovernanceActions } from '@blackout/sdk';
import type { ApiClient, ApiRequest } from '@blackout/sdk';

const buildClientStub = <T>(response: T) => {
    const calls: ApiRequest[] = [];
    const apiClient: ApiClient = async (request) => {
        calls.push(request);
        return response as never;
    };
    return { apiClient, calls };
};

describe('@blackout/protocol governance event guards (BKL-003)', () => {
    it('exposes new event-type strings for meetings and treasury snapshots', () => {
        expect(GOVERNANCE_MEETING_EVENT_TYPE).toBe('co.bmc.governance.meeting');
        expect(GOVERNANCE_TREASURY_SNAPSHOT_EVENT_TYPE).toBe('co.bmc.governance.treasury.snapshot');
    });

    it('isGovernanceMeetingScheduled narrows valid envelopes', () => {
        const valid = {
            event: 'blackout.governance.meeting.scheduled',
            roomId: '!gov:srv',
            senderId: '@chair:srv',
            occurredAt: '2026-04-27T00:00:00.000Z',
            payload: {
                meetingId: 'mtg-1',
                title: 'Q2 review',
                startsAt: '2026-05-01T15:00:00.000Z',
                endsAt: '2026-05-01T16:00:00.000Z',
                attendees: [{ id: '@a:srv' }],
                status: 'scheduled',
            },
        };
        expect(isGovernanceMeetingScheduled(valid)).toBe(true);

        // Cross-contract negative checks.
        expect(isGovernanceVoteCast(valid)).toBe(false);
        expect(isGovernanceTreasurySnapshotPublished(valid)).toBe(false);

        // Reject malformed.
        expect(isGovernanceMeetingScheduled({ ...valid, payload: {} })).toBe(false);
        expect(
            isGovernanceMeetingScheduled({
                ...valid,
                event: 'blackout.governance.proposal.created',
            })
        ).toBe(false);
    });

    it('isGovernanceTreasurySnapshotPublished narrows valid envelopes', () => {
        const valid = {
            event: 'blackout.governance.treasury.snapshot.published',
            roomId: '!gov:srv',
            senderId: '@chair:srv',
            occurredAt: '2026-04-27T00:00:00.000Z',
            payload: {
                snapshotId: 'snap-1',
                generatedAt: '2026-04-27T00:00:00.000Z',
                lines: [{ asset: 'USDC', balance: '1000.00' }],
            },
        };
        expect(isGovernanceTreasurySnapshotPublished(valid)).toBe(true);
        expect(
            isGovernanceTreasurySnapshotPublished({
                ...valid,
                payload: { snapshotId: 'x' },
            })
        ).toBe(false);
    });
});

describe('@blackout/sdk createGovernanceActions (BKL-003 additions)', () => {
    it('scheduleMeeting issues a PUT keyed by meetingId', async () => {
        const meeting: GovernanceMeetingScheduled = {
            event: 'blackout.governance.meeting.scheduled',
            roomId: '!gov:srv',
            senderId: '@chair:srv',
            occurredAt: '2026-04-27T00:00:00.000Z',
            payload: {
                meetingId: 'mtg/with spaces',
                title: 'Strategy',
                startsAt: '2026-05-01T15:00:00.000Z',
                endsAt: '2026-05-01T16:00:00.000Z',
                attendees: [{ id: '@a:srv' }],
                status: 'scheduled',
            },
        };
        const { apiClient, calls } = buildClientStub(meeting);
        const actions = createGovernanceActions(apiClient);

        await actions.scheduleMeeting(meeting.payload);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual({
            method: 'PUT',
            path: `/v1/governance/meetings/${encodeURIComponent('mtg/with spaces')}`,
            body: meeting.payload,
        });
    });

    it('listMeetings supports optional proposalId narrowing', async () => {
        const { apiClient, calls } = buildClientStub<GovernanceMeetingScheduled[]>([]);
        const actions = createGovernanceActions(apiClient);

        await actions.listMeetings();
        expect(calls.at(-1)).toEqual({ method: 'GET', path: '/v1/governance/meetings' });

        await actions.listMeetings({ proposalId: 'prop-9' });
        expect(calls.at(-1)).toEqual({
            method: 'GET',
            path: '/v1/governance/meetings?proposalId=prop-9',
        });
    });

    it('cancelMeeting issues a DELETE keyed by meetingId', async () => {
        const { apiClient, calls } = buildClientStub<GovernanceMeetingScheduled>(
            {} as GovernanceMeetingScheduled
        );
        const actions = createGovernanceActions(apiClient);

        await actions.cancelMeeting('mtg-9');
        expect(calls.at(-1)).toEqual({
            method: 'DELETE',
            path: '/v1/governance/meetings/mtg-9',
        });
    });

    it('getTreasurySnapshot fetches the most recent snapshot', async () => {
        const snapshot: GovernanceTreasurySnapshotPublished = {
            event: 'blackout.governance.treasury.snapshot.published',
            roomId: '!gov:srv',
            senderId: '@chair:srv',
            occurredAt: '2026-04-27T00:00:00.000Z',
            payload: {
                snapshotId: 'snap-1',
                generatedAt: '2026-04-27T00:00:00.000Z',
                lines: [{ asset: 'USDC', balance: '1000.00' }],
            },
        };
        const { apiClient, calls } = buildClientStub(snapshot);
        const actions = createGovernanceActions(apiClient);

        const result = await actions.getTreasurySnapshot();
        expect(calls.at(-1)).toEqual({
            method: 'GET',
            path: '/v1/governance/treasury/snapshot',
        });
        expect(result.payload.snapshotId).toBe('snap-1');
    });

    it('listTreasurySnapshots encodes cursor and limit query params', async () => {
        const { apiClient, calls } = buildClientStub<GovernanceTreasurySnapshotPublished[]>([]);
        const actions = createGovernanceActions(apiClient);

        await actions.listTreasurySnapshots();
        expect(calls.at(-1)?.path).toBe('/v1/governance/treasury/snapshots');

        await actions.listTreasurySnapshots({ limit: 25 });
        expect(calls.at(-1)?.path).toBe('/v1/governance/treasury/snapshots?limit=25');

        await actions.listTreasurySnapshots({ cursor: 'opaque token', limit: 10 });
        expect(calls.at(-1)?.path).toBe(
            `/v1/governance/treasury/snapshots?cursor=${encodeURIComponent('opaque token')}&limit=10`
        );

        // Non-positive limit is dropped.
        await actions.listTreasurySnapshots({ limit: 0 });
        expect(calls.at(-1)?.path).toBe('/v1/governance/treasury/snapshots');
    });

    it('back-compat: createProposal/castVote unchanged', async () => {
        const apiClient = vi.fn(async () => ({})) as unknown as ApiClient;
        const actions = createGovernanceActions(apiClient);
        await actions.createProposal({} as never);
        await actions.castVote({} as never);
        expect((apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual(
            expect.objectContaining({ method: 'POST', path: '/v1/governance/proposals' })
        );
        expect((apiClient as unknown as ReturnType<typeof vi.fn>).mock.calls[1][0]).toEqual(
            expect.objectContaining({ method: 'POST', path: '/v1/governance/votes' })
        );
    });
});
