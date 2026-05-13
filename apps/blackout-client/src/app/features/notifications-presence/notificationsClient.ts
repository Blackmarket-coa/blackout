import type {
    NotificationRulePayload,
    PresenceDigestAcknowledgedEvent,
    PresenceDigestGeneratedEvent,
} from '@blackout/protocol';
import {
    createNotificationActions,
    type NotificationRulesResponse,
} from '@blackout/sdk';
import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const actions = (token: string | null) =>
    createNotificationActions(createAuthorizedApiClient(token));

export type { NotificationRulesResponse };

export function fetchNotificationRules(
    token: string | null = readBlackoutApiToken(),
): Promise<NotificationRulesResponse> {
    return actions(token).fetchNotificationRules();
}

export function upsertNotificationRule(
    rule: NotificationRulePayload,
    token: string | null = readBlackoutApiToken(),
): Promise<NotificationRulePayload> {
    return actions(token).upsertNotificationRule(rule);
}

export function deleteNotificationRule(
    feature: string,
    category: string,
    token: string | null = readBlackoutApiToken(),
): Promise<void> {
    return actions(token).deleteNotificationRule(feature, category);
}

export function fetchPresenceDigest(
    options: { windowMinutes?: number } = {},
    token: string | null = readBlackoutApiToken(),
): Promise<PresenceDigestGeneratedEvent> {
    return actions(token).fetchPresenceDigest(options);
}

export function acknowledgePresenceDigest(
    digestId: string,
    token: string | null = readBlackoutApiToken(),
): Promise<PresenceDigestAcknowledgedEvent> {
    return actions(token).acknowledgePresenceDigest(digestId);
}
