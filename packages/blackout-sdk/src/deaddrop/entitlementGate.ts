/**
 * Tier-aware request validation for dead drop creation.
 *
 * The SDK refuses to send a request that would violate the caller's
 * entitlements *before* it ever leaves the client — this gives the UI
 * a chance to show a tier-upgrade prompt rather than letting the
 * server reject with a generic 403.
 */

import {
    DEAD_DROP_ENTITLEMENT_KEYS,
    DEAD_DROP_QUOTAS,
    type DeadDropQuotas,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import { resolveSdkEntitlement } from '../entitlements';

export type DeadDropGateInput = {
    payloadBytes: number;
    recipientCount: number;
    retentionHours: number;
    requestPaddingBucket: boolean;
    requestCoverSender: boolean;
    requestQuorumOpen: boolean;
    requestScheduledFlush: boolean;
};

export type DeadDropGateResult =
    | { ok: true; tier: EntitlementTier; quotas: DeadDropQuotas }
    | {
          ok: false;
          tier: EntitlementTier;
          reason: DeadDropGateReason;
          message: string;
          /** Suggested upgrade tier that would unblock the action. */
          suggestedTier?: EntitlementTier;
      };

export type DeadDropGateReason =
    | 'feature_disabled'
    | 'payload_too_large'
    | 'retention_too_long'
    | 'too_many_recipients'
    | 'padding_not_entitled'
    | 'cover_sender_not_entitled'
    | 'quorum_not_entitled'
    | 'scheduled_flush_not_entitled'
    | 'multi_recipient_not_entitled';

const TIER_ORDER: readonly EntitlementTier[] = ['free', 'pro', 'team', 'enterprise'];

const findSuggestedTier = (
    payload: EntitlementAccessPayload,
    key: string,
    currentTier: EntitlementTier
): EntitlementTier | undefined => {
    const currentIdx = TIER_ORDER.indexOf(currentTier);
    for (let i = currentIdx + 1; i < TIER_ORDER.length; i += 1) {
        if (DEAD_DROP_QUOTAS[TIER_ORDER[i]]) return TIER_ORDER[i];
    }
    void payload;
    void key;
    return undefined;
};

const tierFromPayload = (payload: EntitlementAccessPayload): EntitlementTier =>
    payload.planState?.tier ?? payload.orgTier ?? 'free';

export const checkDeadDropEntitlements = (
    payload: EntitlementAccessPayload,
    input: DeadDropGateInput
): DeadDropGateResult => {
    const tier = tierFromPayload(payload);
    const quotas = DEAD_DROP_QUOTAS[tier];

    const enabled = resolveSdkEntitlement({
        payload,
        key: DEAD_DROP_ENTITLEMENT_KEYS.enabled,
    }).enabled;
    if (!enabled) {
        return {
            ok: false,
            tier,
            reason: 'feature_disabled',
            message: 'Dead drops are not enabled for your account.',
            suggestedTier: findSuggestedTier(
                payload,
                DEAD_DROP_ENTITLEMENT_KEYS.enabled,
                tier
            ),
        };
    }

    if (input.payloadBytes > quotas.maxPayloadBytes) {
        return {
            ok: false,
            tier,
            reason: 'payload_too_large',
            message: `Payload of ${input.payloadBytes} bytes exceeds the ${quotas.maxPayloadBytes}-byte limit on the ${tier} tier.`,
            suggestedTier: findSuggestedTier(payload, 'maxPayloadBytes', tier),
        };
    }

    if (input.retentionHours > quotas.maxRetentionHours) {
        return {
            ok: false,
            tier,
            reason: 'retention_too_long',
            message: `Retention of ${input.retentionHours}h exceeds the ${quotas.maxRetentionHours}h limit on the ${tier} tier.`,
            suggestedTier: findSuggestedTier(payload, 'maxRetentionHours', tier),
        };
    }

    if (
        quotas.maxRecipients !== -1 &&
        input.recipientCount > quotas.maxRecipients
    ) {
        return {
            ok: false,
            tier,
            reason: 'too_many_recipients',
            message: `Cannot send to ${input.recipientCount} recipients (limit: ${quotas.maxRecipients}).`,
            suggestedTier: findSuggestedTier(payload, 'maxRecipients', tier),
        };
    }

    if (input.recipientCount > 1) {
        const multi = resolveSdkEntitlement({
            payload,
            key: DEAD_DROP_ENTITLEMENT_KEYS.multiRecipient,
        }).enabled;
        if (!multi) {
            return {
                ok: false,
                tier,
                reason: 'multi_recipient_not_entitled',
                message: 'Multi-recipient drops require the Pro tier or higher.',
                suggestedTier: 'pro',
            };
        }
    }

    if (input.requestPaddingBucket) {
        const ok = resolveSdkEntitlement({
            payload,
            key: DEAD_DROP_ENTITLEMENT_KEYS.paddingBucket,
        }).enabled;
        if (!ok) {
            return {
                ok: false,
                tier,
                reason: 'padding_not_entitled',
                message: 'Bucket-grade padding requires the Pro tier or higher.',
                suggestedTier: 'pro',
            };
        }
    }

    if (input.requestCoverSender) {
        const ok = resolveSdkEntitlement({
            payload,
            key: DEAD_DROP_ENTITLEMENT_KEYS.coverSender,
        }).enabled;
        if (!ok) {
            return {
                ok: false,
                tier,
                reason: 'cover_sender_not_entitled',
                message: 'Cover-sender pseudonymity requires the Pro tier or higher.',
                suggestedTier: 'pro',
            };
        }
    }

    if (input.requestQuorumOpen) {
        const ok = resolveSdkEntitlement({
            payload,
            key: DEAD_DROP_ENTITLEMENT_KEYS.quorumOpen,
        }).enabled;
        if (!ok) {
            return {
                ok: false,
                tier,
                reason: 'quorum_not_entitled',
                message: 'k-of-n quorum opens require the Team tier or higher.',
                suggestedTier: 'team',
            };
        }
    }

    if (input.requestScheduledFlush) {
        const ok = resolveSdkEntitlement({
            payload,
            key: DEAD_DROP_ENTITLEMENT_KEYS.scheduledFlush,
        }).enabled;
        if (!ok) {
            return {
                ok: false,
                tier,
                reason: 'scheduled_flush_not_entitled',
                message: 'Scheduled flush requires the Pro tier or higher.',
                suggestedTier: 'pro',
            };
        }
    }

    return { ok: true, tier, quotas };
};

export const tierFromEntitlementPayload = tierFromPayload;
