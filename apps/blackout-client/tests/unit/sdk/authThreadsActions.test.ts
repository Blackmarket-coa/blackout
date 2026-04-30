import { describe, expect, it } from 'vitest';
import {
    AUTH_THREADS_EVENT_NAMES,
    isAuthSessionContinued,
    isThreadActivityUpdated,
    type AuthSessionContinuedEvent,
    type ThreadActivityUpdatedEvent,
    type ThreadActivityUpdatedPayload,
} from '@blackout/protocol';
import {
    aggregateThreadUnread,
    applyThreadActivityUpdate,
    createAuthActions,
    createThreadActivityActions,
    isSessionExpired,
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

describe('@blackout/protocol auth-threads guards (BKL-011)', () => {
    it('publishes the canonical Matrix event types', () => {
        expect(AUTH_THREADS_EVENT_NAMES.threadActivityUpdated).toBe(
            'co.bmc.thread.activity.updated'
        );
        expect(AUTH_THREADS_EVENT_NAMES.authSessionContinued).toBe(
            'co.bmc.auth.session.continued'
        );
    });

    it('isThreadActivityUpdated enforces the kind union', () => {
        const valid: ThreadActivityUpdatedEvent = {
            event: 'blackout.thread.activity.updated',
            roomId: '!r:srv',
            senderId: '@a:srv',
            occurredAt: '2026-04-30T00:00:00.000Z',
            payload: {
                activityId: 'a-1',
                threadRootEventId: '$root:srv',
                roomId: '!r:srv',
                kind: 'thread_started',
                unreadCount: 3,
                occurredAt: '2026-04-30T00:00:00.000Z',
            },
        };
        expect(isThreadActivityUpdated(valid)).toBe(true);
        expect(
            isThreadActivityUpdated({
                ...valid,
                payload: { ...valid.payload, kind: 'rogue' },
            })
        ).toBe(false);
    });

    it('isAuthSessionContinued enforces the reason union', () => {
        const valid: AuthSessionContinuedEvent = {
            event: 'blackout.auth.session.continued',
            roomId: '!a:srv',
            senderId: '@server:srv',
            occurredAt: '2026-04-30T00:00:00.000Z',
            payload: {
                subject: '@a:srv',
                issuer: 'https://idp.example',
                issuedAt: '2026-04-30T00:00:00.000Z',
                expiresAt: '2026-04-30T01:00:00.000Z',
                reason: 'login',
            },
        };
        expect(isAuthSessionContinued(valid)).toBe(true);
        expect(
            isAuthSessionContinued({
                ...valid,
                payload: { ...valid.payload, reason: 'rogue' },
            })
        ).toBe(false);
    });
});

describe('createAuthActions', () => {
    it('beginOidcLogin POSTs the redirectUri', async () => {
        const { apiClient, calls } = buildClient({ authorizationUrl: 'x', scopes: [] });
        const actions = createAuthActions(apiClient);
        await actions.beginOidcLogin({ redirectUri: 'https://app/callback' });
        expect(calls.at(-1)).toEqual({
            method: 'POST',
            path: '/v1/auth/oidc/begin',
            body: { redirectUri: 'https://app/callback' },
        });
    });

    it('continueOidcSession + signOut hit the canonical paths', async () => {
        const { apiClient, calls } = buildClient<unknown>({});
        const actions = createAuthActions(apiClient);

        await actions.continueOidcSession({ reason: 'refresh' });
        expect(calls.at(-1)).toEqual({
            method: 'POST',
            path: '/v1/auth/oidc/continue',
            body: { reason: 'refresh' },
        });

        await actions.signOut();
        expect(calls.at(-1)).toEqual({
            method: 'POST',
            path: '/v1/auth/sign-out',
            body: {},
        });
    });
});

describe('createThreadActivityActions', () => {
    it('listActivity drops non-positive limits and encodes since', async () => {
        const { apiClient, calls } = buildClient({ subject: '@a:srv', activities: [] });
        const actions = createThreadActivityActions(apiClient);

        await actions.listActivity();
        expect(calls.at(-1)?.path).toBe('/v1/threads/activity');

        await actions.listActivity({ limit: 25, sinceIso: '2026-04-30T00:00:00.000Z' });
        expect(calls.at(-1)?.path).toBe(
            `/v1/threads/activity?limit=25&since=${encodeURIComponent('2026-04-30T00:00:00.000Z')}`
        );

        await actions.listActivity({ limit: 0 });
        expect(calls.at(-1)?.path).toBe('/v1/threads/activity');
    });

    it('markActivityRead encodes the activity id', async () => {
        const { apiClient, calls } = buildClient<unknown>({});
        const actions = createThreadActivityActions(apiClient);
        await actions.markActivityRead('a 9');
        expect(calls.at(-1)).toEqual({
            method: 'POST',
            path: `/v1/threads/activity/${encodeURIComponent('a 9')}/read`,
            body: {},
        });
    });
});

describe('aggregateThreadUnread', () => {
    it('sums positive unread counts and ignores zero/negative values', () => {
        const activities: ThreadActivityUpdatedPayload[] = [
            {
                activityId: 'a',
                threadRootEventId: '$1',
                roomId: '!r:s',
                kind: 'thread_started',
                unreadCount: 3,
                occurredAt: '2026-04-30T00:00:00.000Z',
            },
            {
                activityId: 'b',
                threadRootEventId: '$2',
                roomId: '!r:s',
                kind: 'thread_replied',
                unreadCount: 0,
                occurredAt: '2026-04-30T00:00:00.000Z',
            },
            {
                activityId: 'c',
                threadRootEventId: '$3',
                roomId: '!r:s',
                kind: 'thread_replied',
                unreadCount: 7,
                occurredAt: '2026-04-30T00:00:00.000Z',
            },
        ];
        expect(aggregateThreadUnread(activities)).toBe(10);
    });
});

describe('applyThreadActivityUpdate', () => {
    const base: ThreadActivityUpdatedPayload[] = [
        {
            activityId: 'a',
            threadRootEventId: '$1',
            roomId: '!r:s',
            kind: 'thread_started',
            unreadCount: 3,
            occurredAt: '2026-04-29T00:00:00.000Z',
        },
        {
            activityId: 'b',
            threadRootEventId: '$2',
            roomId: '!r:s',
            kind: 'thread_replied',
            unreadCount: 1,
            occurredAt: '2026-04-30T00:00:00.000Z',
        },
    ];

    it('replaces an existing entry by activityId and resorts newest-first', () => {
        const updated = applyThreadActivityUpdate(base, {
            ...base[0],
            unreadCount: 5,
            occurredAt: '2026-05-01T00:00:00.000Z',
        });
        expect(updated.map((entry) => entry.activityId)).toEqual(['a', 'b']);
        expect(updated[0].unreadCount).toBe(5);
    });

    it('drops entries on zero-unread updates', () => {
        const updated = applyThreadActivityUpdate(base, {
            ...base[1],
            unreadCount: 0,
        });
        expect(updated.map((entry) => entry.activityId)).toEqual(['a']);
    });
});

describe('isSessionExpired', () => {
    it('returns true for null sessions', () => {
        expect(isSessionExpired(null, '2026-04-30T00:00:00.000Z')).toBe(true);
    });

    it('returns true when the session has expired', () => {
        expect(
            isSessionExpired(
                { expiresAt: '2026-04-30T00:00:00.000Z' },
                '2026-04-30T01:00:00.000Z'
            )
        ).toBe(true);
    });

    it('returns false when the session is still active', () => {
        expect(
            isSessionExpired(
                { expiresAt: '2026-04-30T01:00:00.000Z' },
                '2026-04-30T00:30:00.000Z'
            )
        ).toBe(false);
    });

    it('returns true on unparseable inputs', () => {
        expect(isSessionExpired({ expiresAt: 'not-a-time' }, '2026-04-30T00:00:00.000Z')).toBe(
            true
        );
        expect(isSessionExpired({ expiresAt: '2026-04-30T00:00:00.000Z' }, 'now-ish')).toBe(true);
    });
});
