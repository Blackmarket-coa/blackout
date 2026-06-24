import type {
    GovernanceMeetingPayload,
    GovernanceTreasuryMilestonePayload,
    GovernanceTreasurySnapshotPayload,
} from '@blackout/protocol';
import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const BASE = '/v1/governance';

export interface ListMeetingsResponse {
    items: GovernanceMeetingPayload[];
}

export interface ListTreasurySnapshotsResponse {
    items: GovernanceTreasurySnapshotPayload[];
    nextCursor?: string;
}

export interface ListTreasuryMilestonesResponse {
    items: GovernanceTreasuryMilestonePayload[];
}

function getJson<T>(path: string, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'GET', path }) as Promise<T>;
}

function putJson<T>(path: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'PUT', path, body }) as Promise<T>;
}

function postJson<T>(path: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'POST', path, body }) as Promise<T>;
}

function deleteJson<T>(path: string, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'DELETE', path }) as Promise<T>;
}

export function listMeetings(
    options: { proposalId?: string } = {},
    token: string | null = readBlackoutApiToken(),
): Promise<ListMeetingsResponse> {
    const search = options.proposalId
        ? `?proposalId=${encodeURIComponent(options.proposalId)}`
        : '';
    return getJson<ListMeetingsResponse>(`${BASE}/meetings${search}`, token);
}

export function scheduleMeeting(
    payload: GovernanceMeetingPayload,
    token: string | null = readBlackoutApiToken(),
): Promise<GovernanceMeetingPayload> {
    return putJson<GovernanceMeetingPayload>(
        `${BASE}/meetings/${encodeURIComponent(payload.meetingId)}`,
        payload,
        token,
    );
}

export function cancelMeeting(
    meetingId: string,
    token: string | null = readBlackoutApiToken(),
): Promise<GovernanceMeetingPayload> {
    return deleteJson<GovernanceMeetingPayload>(
        `${BASE}/meetings/${encodeURIComponent(meetingId)}`,
        token,
    );
}

export function getTreasurySnapshot(
    token: string | null = readBlackoutApiToken(),
): Promise<GovernanceTreasurySnapshotPayload> {
    return getJson<GovernanceTreasurySnapshotPayload>(`${BASE}/treasury/snapshot`, token);
}

export function listTreasurySnapshots(
    options: { cursor?: string; limit?: number } = {},
    token: string | null = readBlackoutApiToken(),
): Promise<ListTreasurySnapshotsResponse> {
    const params = new URLSearchParams();
    if (options.cursor) params.set('cursor', options.cursor);
    if (typeof options.limit === 'number') params.set('limit', String(options.limit));
    const qs = params.toString();
    return getJson<ListTreasurySnapshotsResponse>(
        `${BASE}/treasury/snapshots${qs ? `?${qs}` : ''}`,
        token,
    );
}

export function publishTreasurySnapshot(
    payload: GovernanceTreasurySnapshotPayload,
    token: string | null = readBlackoutApiToken(),
): Promise<GovernanceTreasurySnapshotPayload> {
    return postJson<GovernanceTreasurySnapshotPayload>(
        `${BASE}/treasury/snapshot`,
        payload,
        token,
    );
}

export function listTreasuryMilestones(
    options: { includeArchived?: boolean } = {},
    token: string | null = readBlackoutApiToken(),
): Promise<ListTreasuryMilestonesResponse> {
    const qs = options.includeArchived ? '?includeArchived=1' : '';
    return getJson<ListTreasuryMilestonesResponse>(`${BASE}/treasury/milestones${qs}`, token);
}

export function upsertTreasuryMilestone(
    payload: GovernanceTreasuryMilestonePayload,
    token: string | null = readBlackoutApiToken(),
): Promise<GovernanceTreasuryMilestonePayload> {
    return postJson<GovernanceTreasuryMilestonePayload>(
        `${BASE}/treasury/milestones`,
        payload,
        token,
    );
}
