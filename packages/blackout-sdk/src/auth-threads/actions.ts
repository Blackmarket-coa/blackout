import type {
    AuthSessionContinuationReason,
    AuthSessionContinuedEvent,
    AuthSessionContinuedPayload,
    ThreadActivityKind,
    ThreadActivityUpdatedEvent,
    ThreadActivityUpdatedPayload,
} from '@blackout/protocol';
import type { ApiClient } from '../client/types';

export type OidcBootstrapDescriptor = {
    /** Authorization endpoint the canonical client should redirect to. */
    authorizationUrl: string;
    /** Optional state token the IDP echoes back. */
    state?: string;
    /** OIDC scopes requested. */
    scopes: string[];
};

export type ThreadActivityListResponse = {
    subject: string;
    activities: ThreadActivityUpdatedPayload[];
};

export const createAuthActions = (client: ApiClient) => ({
    /**
     * Begin an OIDC delegated-login flow. Server returns the
     * authorization URL the canonical client should redirect to. The
     * `redirectUri` argument MUST match the IDP-registered callback.
     */
    beginOidcLogin: (input: { redirectUri: string; scopes?: string[] }) =>
        client<OidcBootstrapDescriptor>({
            method: 'POST',
            path: '/v1/auth/oidc/begin',
            body: input,
        }),
    /**
     * Continue/refresh the current OIDC session. Server emits a
     * `blackout.auth.session.continued` envelope.
     */
    continueOidcSession: (input: {
        reason: AuthSessionContinuationReason;
        idToken?: string;
    }) =>
        client<AuthSessionContinuedEvent>({
            method: 'POST',
            path: '/v1/auth/oidc/continue',
            body: input,
        }),
    /**
     * Sign out the current session. Idempotent — the canonical client
     * can call this even if no session is active.
     */
    signOut: () =>
        client<void>({
            method: 'POST',
            path: '/v1/auth/sign-out',
            body: {},
        }),
});

export const createThreadActivityActions = (client: ApiClient) => ({
    /**
     * Fetch the most recent thread-activity entries for the subject's
     * inbox. Default ordering: newest first by `occurredAt`.
     */
    listActivity: (options: { limit?: number; sinceIso?: string } = {}) => {
        const params: string[] = [];
        if (typeof options.limit === 'number' && options.limit > 0) {
            params.push(`limit=${options.limit | 0}`);
        }
        if (options.sinceIso) {
            params.push(`since=${encodeURIComponent(options.sinceIso)}`);
        }
        const query = params.length ? `?${params.join('&')}` : '';
        return client<ThreadActivityListResponse>({
            method: 'GET',
            path: `/v1/threads/activity${query}`,
        });
    },
    /**
     * Mark an activity entry as read. Server emits a
     * `blackout.thread.activity.updated` envelope with `unreadCount: 0`.
     */
    markActivityRead: (activityId: string) =>
        client<ThreadActivityUpdatedEvent>({
            method: 'POST',
            path: `/v1/threads/activity/${encodeURIComponent(activityId)}/read`,
            body: {},
        }),
});

/**
 * Pure helper: aggregates a list of thread-activity entries into a
 * total unread count. Used by the inbox badge so it doesn't have to
 * round-trip through the server. Ignores entries with non-positive
 * `unreadCount` (treat as resolved/zero).
 */
export const aggregateThreadUnread = (
    activities: readonly ThreadActivityUpdatedPayload[]
): number =>
    activities.reduce(
        (acc, entry) => acc + (entry.unreadCount > 0 ? entry.unreadCount : 0),
        0
    );

/**
 * Pure helper: merges a thread-activity envelope into a local list,
 * replacing any existing entry with the same `activityId` and sorting
 * newest-first by `occurredAt`. Drops zero-unread updates from the
 * resulting list to keep the inbox tight.
 */
export const applyThreadActivityUpdate = (
    activities: readonly ThreadActivityUpdatedPayload[],
    payload: ThreadActivityUpdatedPayload
): ThreadActivityUpdatedPayload[] => {
    const without = activities.filter((entry) => entry.activityId !== payload.activityId);
    const next = payload.unreadCount > 0 ? [payload, ...without] : without;
    return [...next].sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    );
};

/**
 * Pure helper: computes whether an OIDC session has expired given the
 * current time. Treats unparseable / missing `expiresAt` as expired so
 * callers don't accidentally render stale sessions.
 */
export const isSessionExpired = (
    session: Pick<AuthSessionContinuedPayload, 'expiresAt'> | null,
    nowIso: string
): boolean => {
    if (!session) return true;
    const expiresMs = new Date(session.expiresAt).getTime();
    const nowMs = new Date(nowIso).getTime();
    if (Number.isNaN(expiresMs) || Number.isNaN(nowMs)) return true;
    return expiresMs <= nowMs;
};

export type {
    AuthSessionContinuationReason,
    AuthSessionContinuedEvent,
    AuthSessionContinuedPayload,
    ThreadActivityKind,
    ThreadActivityUpdatedEvent,
    ThreadActivityUpdatedPayload,
};
