import type {
    NotificationRulePayload,
    PresenceDigestAcknowledgedEvent,
    PresenceDigestActivity,
    PresenceDigestGeneratedEvent,
    PresenceDigestPayload,
} from '@blackout/protocol';
import type { ApiClient } from '../client/types';

export type NotificationRulesResponse = {
    /** Subject the rules apply to (typically the authenticated Matrix user id). */
    subject: string;
    rules: NotificationRulePayload[];
};

export const createNotificationActions = (client: ApiClient) => ({
    /**
     * Fetches the canonical notification rule set for the authenticated
     * subject. Backed by `GET /v1/notifications/rules`. Returns the full
     * set so the canonical client can replace its local snapshot atomically.
     */
    fetchNotificationRules: () =>
        client<NotificationRulesResponse>({
            method: 'GET',
            path: '/v1/notifications/rules',
        }),
    /**
     * Upsert a single notification rule keyed by `<feature>:<category>`.
     * The server enforces uniqueness on that pair; PUT is idempotent.
     */
    upsertNotificationRule: (rule: NotificationRulePayload) =>
        client<NotificationRulePayload>({
            method: 'PUT',
            path: `/v1/notifications/rules/${encodeURIComponent(rule.feature)}/${encodeURIComponent(rule.category)}`,
            body: rule,
        }),
    /**
     * Delete a notification rule by `<feature>:<category>`.
     */
    deleteNotificationRule: (feature: string, category: string) =>
        client<void>({
            method: 'DELETE',
            path: `/v1/notifications/rules/${encodeURIComponent(feature)}/${encodeURIComponent(category)}`,
        }),
    /**
     * Fetch the most recent presence digest for the subject. Optional
     * `windowMinutes` overrides the server default; values <= 0 are
     * dropped before request.
     */
    fetchPresenceDigest: (options: { windowMinutes?: number } = {}) => {
        const search =
            typeof options.windowMinutes === 'number' && options.windowMinutes > 0
                ? `?windowMinutes=${options.windowMinutes}`
                : '';
        return client<PresenceDigestGeneratedEvent>({
            method: 'GET',
            path: `/v1/notifications/presence-digest${search}`,
        });
    },
    /**
     * Acknowledge a presence digest. The server records read state and
     * emits a `blackout.notifications.digest.acknowledged` envelope.
     */
    acknowledgePresenceDigest: (digestId: string) =>
        client<PresenceDigestAcknowledgedEvent>({
            method: 'POST',
            path: `/v1/notifications/presence-digests/${encodeURIComponent(digestId)}/ack`,
            body: {},
        }),
});

/**
 * Pure builder for a presence digest. Mirrors the legacy
 * `apps/blackout-web/src/services/presence-digest.ts` semantics so the
 * canonical client can compute digests offline (e.g. from native bridge
 * events) without server roundtrips.
 *
 * Filters activities to the [now - windowMinutes, now] window and returns
 * them sorted newest-first.
 */
export const buildPresenceDigest = (
    activities: readonly PresenceDigestActivity[],
    nowIso: string,
    config: { windowMinutes: number }
): PresenceDigestActivity[] => {
    const nowMs = new Date(nowIso).getTime();
    if (Number.isNaN(nowMs)) return [];
    const windowMs = Math.max(0, config.windowMinutes) * 60_000;

    return activities
        .filter((activity) => {
            const activityMs = new Date(activity.lastActiveAt).getTime();
            if (Number.isNaN(activityMs)) return false;
            const ageMs = nowMs - activityMs;
            return ageMs >= 0 && ageMs <= windowMs;
        })
        .sort(
            (left, right) =>
                new Date(right.lastActiveAt).getTime() - new Date(left.lastActiveAt).getTime()
        );
};

export type {
    NotificationRulePayload,
    PresenceDigestAcknowledgedEvent,
    PresenceDigestActivity,
    PresenceDigestGeneratedEvent,
    PresenceDigestPayload,
};
