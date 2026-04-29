import type {
    GovernanceMeetingScheduled,
    GovernanceProposalCreated,
    GovernanceTreasurySnapshotPublished,
    GovernanceVoteCast,
} from '@blackout/protocol';
import type { ApiClient } from '../client/types';

export const createGovernanceActions = (client: ApiClient) => ({
    createProposal: (payload: GovernanceProposalCreated['payload']) =>
        client<GovernanceProposalCreated>({
            method: 'POST',
            path: '/v1/governance/proposals',
            body: payload,
        }),
    castVote: (payload: GovernanceVoteCast['payload']) =>
        client<GovernanceVoteCast>({
            method: 'POST',
            path: '/v1/governance/votes',
            body: payload,
        }),
    /**
     * Schedule (or update) a governance meeting. The server reconciles by
     * `meetingId`; PUT is idempotent and returns the canonical envelope.
     */
    scheduleMeeting: (payload: GovernanceMeetingScheduled['payload']) =>
        client<GovernanceMeetingScheduled>({
            method: 'PUT',
            path: `/v1/governance/meetings/${encodeURIComponent(payload.meetingId)}`,
            body: payload,
        }),
    /**
     * List meetings for the authenticated subject. Optional `proposalId`
     * narrows results to meetings linked to a specific proposal.
     */
    listMeetings: (options: { proposalId?: string } = {}) => {
        const search = options.proposalId
            ? `?proposalId=${encodeURIComponent(options.proposalId)}`
            : '';
        return client<GovernanceMeetingScheduled[]>({
            method: 'GET',
            path: `/v1/governance/meetings${search}`,
        });
    },
    /**
     * Cancel a meeting by id. Returns the updated envelope with
     * `payload.status === 'cancelled'`.
     */
    cancelMeeting: (meetingId: string) =>
        client<GovernanceMeetingScheduled>({
            method: 'DELETE',
            path: `/v1/governance/meetings/${encodeURIComponent(meetingId)}`,
        }),
    /**
     * Fetch the most recent treasury snapshot.
     */
    getTreasurySnapshot: () =>
        client<GovernanceTreasurySnapshotPublished>({
            method: 'GET',
            path: '/v1/governance/treasury/snapshot',
        }),
    /**
     * Page through historical treasury snapshots, newest first. Cursors are
     * server-provided; clients should treat them as opaque.
     */
    listTreasurySnapshots: (options: { cursor?: string; limit?: number } = {}) => {
        const params: string[] = [];
        if (options.cursor) params.push(`cursor=${encodeURIComponent(options.cursor)}`);
        if (typeof options.limit === 'number' && options.limit > 0) {
            params.push(`limit=${options.limit}`);
        }
        const search = params.length > 0 ? `?${params.join('&')}` : '';
        return client<GovernanceTreasurySnapshotPublished[]>({
            method: 'GET',
            path: `/v1/governance/treasury/snapshots${search}`,
        });
    },
});
