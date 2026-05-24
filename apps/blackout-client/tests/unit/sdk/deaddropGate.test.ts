import { describe, expect, it } from 'vitest';
import {
    DEAD_DROP_QUOTAS,
    DEAD_DROP_TIER_ENTITLEMENTS,
    buildFullyUnlockedEntitlementPayload,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import { checkDeadDropEntitlements, type DeadDropGateInput } from '@blackout/sdk';

const payloadFor = (tier: EntitlementTier): EntitlementAccessPayload => ({
    deploymentPreset: 'starter',
    deploymentPresetEntitlements: DEAD_DROP_TIER_ENTITLEMENTS[tier],
    orgTier: tier,
    orgTierEntitlements: DEAD_DROP_TIER_ENTITLEMENTS[tier],
    planState: {
        tier,
        status: tier === 'free' ? 'inactive' : 'active',
        isPaid: tier !== 'free',
    },
});

const baseInput = (overrides: Partial<DeadDropGateInput> = {}): DeadDropGateInput => ({
    payloadBytes: 1024,
    recipientCount: 1,
    retentionHours: 12,
    requestPaddingBucket: false,
    requestCoverSender: false,
    requestQuorumOpen: false,
    requestScheduledFlush: false,
    ...overrides,
});

describe('checkDeadDropEntitlements (free tier)', () => {
    it('allows a baseline drop within free quota', () => {
        const result = checkDeadDropEntitlements(payloadFor('free'), baseInput());
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.tier).toBe('free');
    });

    it('rejects payloads above the free byte limit and suggests an upgrade', () => {
        const result = checkDeadDropEntitlements(
            payloadFor('free'),
            baseInput({ payloadBytes: DEAD_DROP_QUOTAS.free.maxPayloadBytes + 1 })
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toBe('payload_too_large');
            expect(result.suggestedTier).toBeDefined();
        }
    });

    it('rejects retention longer than the free window', () => {
        const result = checkDeadDropEntitlements(
            payloadFor('free'),
            baseInput({ retentionHours: 25 })
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('retention_too_long');
    });

    it('rejects multi-recipient drops and bucket padding', () => {
        const multi = checkDeadDropEntitlements(
            payloadFor('free'),
            baseInput({ recipientCount: 2 })
        );
        expect(multi.ok).toBe(false);
        if (!multi.ok) expect(multi.reason).toBe('too_many_recipients');

        const padding = checkDeadDropEntitlements(
            payloadFor('free'),
            baseInput({ requestPaddingBucket: true })
        );
        expect(padding.ok).toBe(false);
        if (!padding.ok) expect(padding.reason).toBe('padding_not_entitled');
    });

    it('rejects cover sender, quorum, and scheduled flush', () => {
        for (const reasonInput of [
            { requestCoverSender: true } as const,
            { requestQuorumOpen: true } as const,
            { requestScheduledFlush: true } as const,
        ]) {
            const result = checkDeadDropEntitlements(payloadFor('free'), baseInput(reasonInput));
            expect(result.ok).toBe(false);
        }
    });
});

describe('checkDeadDropEntitlements (pro tier)', () => {
    it('allows a 4 MiB drop with bucket padding and cover sender', () => {
        const result = checkDeadDropEntitlements(
            payloadFor('pro'),
            baseInput({
                payloadBytes: 4 * 1024 * 1024,
                retentionHours: 24 * 7,
                requestPaddingBucket: true,
                requestCoverSender: true,
                requestScheduledFlush: true,
            })
        );
        expect(result.ok).toBe(true);
    });

    it('still rejects quorum opens (Team tier required)', () => {
        const result = checkDeadDropEntitlements(
            payloadFor('pro'),
            baseInput({ requestQuorumOpen: true })
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toBe('quorum_not_entitled');
            expect(result.suggestedTier).toBe('team');
        }
    });
});

describe('checkDeadDropEntitlements (team / enterprise tiers)', () => {
    it('team tier unlocks quorum opens', () => {
        const result = checkDeadDropEntitlements(
            payloadFor('team'),
            baseInput({
                requestPaddingBucket: true,
                requestQuorumOpen: true,
                requestCoverSender: true,
                requestScheduledFlush: true,
                payloadBytes: 10 * 1024 * 1024,
                retentionHours: 24 * 60,
            })
        );
        expect(result.ok).toBe(true);
    });

    it('enterprise tier supports unlimited recipients', () => {
        const result = checkDeadDropEntitlements(
            payloadFor('enterprise'),
            baseInput({ recipientCount: 1_000_000 })
        );
        expect(result.ok).toBe(true);
    });

    it('disabled-for-account fallback rejects gracefully', () => {
        const payload: EntitlementAccessPayload = {
            ...payloadFor('free'),
            deploymentPresetEntitlements: { 'features.deaddrop.enabled': false },
            orgTierEntitlements: { 'features.deaddrop.enabled': false },
        };
        const result = checkDeadDropEntitlements(payload, baseInput());
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('feature_disabled');
    });
});

describe('buildFullyUnlockedEntitlementPayload (beta unlock)', () => {
    it('passes every gated dead-drop request at enterprise quotas', () => {
        const result = checkDeadDropEntitlements(
            buildFullyUnlockedEntitlementPayload(),
            baseInput({
                requestPaddingBucket: true,
                requestCoverSender: true,
                requestQuorumOpen: true,
                requestScheduledFlush: true,
                recipientCount: 1_000_000,
                payloadBytes: 100 * 1024 * 1024,
                retentionHours: 24 * 300,
            })
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.tier).toBe('enterprise');
            expect(result.quotas).toEqual(DEAD_DROP_QUOTAS.enterprise);
        }
    });
});
