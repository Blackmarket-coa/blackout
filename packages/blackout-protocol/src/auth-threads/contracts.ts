/**
 * Auth (OIDC) + thread-activity contracts (BKL-011).
 *
 * Mirrors the OIDC-delegated login flow that `apps/blackout-web` carries
 * and the threads-activity inbox surfaced by `legacy.config.threads_activity`.
 */

import type { EventEnvelope } from '../common/types';

export const AUTH_THREADS_PROTOCOL_VERSION = 1 as const;

export const AUTH_THREADS_EVENT_NAMES = {
    threadActivityUpdated: 'co.bmc.thread.activity.updated',
    authSessionContinued: 'co.bmc.auth.session.continued',
} as const;

export type AuthThreadsEventName =
    (typeof AUTH_THREADS_EVENT_NAMES)[keyof typeof AUTH_THREADS_EVENT_NAMES];

/**
 * Reason a thread-activity envelope was emitted. Receivers route the
 * unread inbox + thread-jump UI off this union.
 */
export type ThreadActivityKind =
    | 'thread_started'
    | 'thread_replied'
    | 'thread_resolved';

export interface ThreadActivityUpdatedPayload {
    /** Activity id (server-issued; opaque). */
    activityId: string;
    /** Stable thread root event id. */
    threadRootEventId: string;
    /** Room the thread lives in. */
    roomId: string;
    /** Why this activity exists. */
    kind: ThreadActivityKind;
    /** Unread count in the thread for the current subject after this update. */
    unreadCount: number;
    /** ISO-8601 timestamp the activity took effect. */
    occurredAt: string;
}

/**
 * OIDC session-continuation reason. Receivers may use this to drive
 * "you were signed in via your IDP" hints.
 */
export type AuthSessionContinuationReason =
    | 'login'
    | 'refresh'
    | 'idp_handoff';

export interface AuthSessionContinuedPayload {
    /** Subject the session belongs to (typically the Matrix user id). */
    subject: string;
    /** OIDC issuer that minted the session. */
    issuer: string;
    /** ISO-8601 timestamp the session became active. */
    issuedAt: string;
    /** ISO-8601 timestamp the session token expires. */
    expiresAt: string;
    /** Why the session was continued. */
    reason: AuthSessionContinuationReason;
}

export type ThreadActivityUpdatedEvent = EventEnvelope<
    'blackout.thread.activity.updated',
    ThreadActivityUpdatedPayload
>;

export type AuthSessionContinuedEvent = EventEnvelope<
    'blackout.auth.session.continued',
    AuthSessionContinuedPayload
>;
