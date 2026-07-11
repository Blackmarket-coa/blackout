/**
 * Notification + presence-digest contracts (BKL-004).
 *
 * Mirrors the `NotificationRule` shape that apps/blackout-web ships in
 * `src/types.ts` so canonical and legacy hosts agree on rule semantics.
 * Adds canonical contracts for presence digests (generation +
 * acknowledgement) so the canonical client can drive both notification
 * policy and presence batching from the same registry-driven manifests.
 */

import type { EventEnvelope } from '../common/types';

export const NOTIFICATIONS_PROTOCOL_VERSION = 1 as const;

export const NOTIFICATIONS_EVENT_NAMES = {
    digestGenerated: 'co.bmc.notifications.digest.generated',
    digestAcknowledged: 'co.bmc.notifications.digest.acknowledged',
} as const;

export type NotificationsEventName =
    typeof NOTIFICATIONS_EVENT_NAMES[keyof typeof NOTIFICATIONS_EVENT_NAMES];

export interface NotificationRulePayload {
    /** Feature surface the rule applies to (e.g. `mentions`, `reactions`). */
    feature: string;
    /** Subject category within the feature (e.g. `dm`, `room`, `space`). */
    category: string;
    /**
     * Optional Matrix room id narrowing the rule to a single room (Workstream
     * F "advanced notification controls"). A room-scoped rule overrides the
     * category-wide rule for events in that room; rules without `roomId`
     * remain the category-wide default, so pre-existing rules are unaffected.
     */
    roomId?: string;
    /** Hard cap of notifications per UTC day. */
    hardCapPerDay: number;
    /** Minimum spacing between consecutive notifications within the category. */
    cooldownMinutes: number;
    /** Optional UTC quiet-hours window: notifications are batched, not dropped. */
    quietHours?: {
        startUtc: string;
        endUtc: string;
    };
}

export interface PresenceDigestActivity {
    /** Matrix user id (`@user:server`) or opaque subject id for non-Matrix peers. */
    userId: string;
    /** ISO-8601 timestamp of the most recent activity within the digest window. */
    lastActiveAt: string;
}

export interface PresenceDigestPayload {
    /** Stable id for the digest. Required so acknowledgements can reconcile. */
    digestId: string;
    /** ISO-8601 timestamp the digest was assembled. */
    generatedAt: string;
    /** Window the digest covers, in minutes. */
    windowMinutes: number;
    /** Aggregated activities in the window, newest first. */
    activities: PresenceDigestActivity[];
}

export interface PresenceDigestAcknowledgedPayload {
    /** Digest being acknowledged. Receivers should treat unknown ids as no-ops. */
    digestId: string;
    /** ISO-8601 timestamp the recipient acknowledged. */
    acknowledgedAt: string;
}

export type PresenceDigestGeneratedEvent = EventEnvelope<
    'blackout.notifications.digest.generated',
    PresenceDigestPayload
>;

export type PresenceDigestAcknowledgedEvent = EventEnvelope<
    'blackout.notifications.digest.acknowledged',
    PresenceDigestAcknowledgedPayload
>;
