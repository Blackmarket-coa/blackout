// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import {
    PERSONA_QUOTAS,
    PERSONA_TIER_ENTITLEMENTS,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import {
    usePersonaQuota,
    type PersonaQuotaSnapshot,
} from '../../../../src/app/features/burner-identity/usePersonaQuota';

const payloadFor = (tier: EntitlementTier): EntitlementAccessPayload => ({
    deploymentPreset: 'starter',
    deploymentPresetEntitlements: PERSONA_TIER_ENTITLEMENTS[tier],
    orgTier: tier,
    orgTierEntitlements: PERSONA_TIER_ENTITLEMENTS[tier],
    planState: { tier, status: tier === 'free' ? 'inactive' : 'active', isPaid: tier !== 'free' },
});

let container: HTMLDivElement | null = null;

afterEach(() => {
    container?.remove();
    container = null;
});

const snapshotFor = async (tier: EntitlementTier): Promise<PersonaQuotaSnapshot> => {
    container = document.createElement('div');
    document.body.appendChild(container);
    let captured: PersonaQuotaSnapshot | undefined;
    const Probe: React.FC = () => {
        captured = usePersonaQuota(payloadFor(tier));
        return null;
    };
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(React.createElement(Probe));
    });
    await act(async () => {
        root.unmount();
    });
    if (!captured) throw new Error('hook did not run');
    return captured;
};

describe('usePersonaQuota', () => {
    it('reports free-tier roster + gated rotation/compartments', async () => {
        const snap = await snapshotFor('free');
        expect(snap.tier).toBe('free');
        expect(snap.enabled).toBe(true);
        expect(snap.canRotate).toBe(false);
        expect(snap.canUseCompartments).toBe(false);
        expect(snap.quotas.maxPersonas).toBe(PERSONA_QUOTAS.free.maxPersonas);
        expect(snap.remaining(0)).toBe(PERSONA_QUOTAS.free.maxPersonas);
        expect(snap.remaining(PERSONA_QUOTAS.free.maxPersonas)).toBe(0);
    });

    it('unlocks rotation/compartments on pro', async () => {
        const snap = await snapshotFor('pro');
        expect(snap.canRotate).toBe(true);
        expect(snap.canUseCompartments).toBe(true);
    });

    it('treats enterprise roster as unlimited', async () => {
        const snap = await snapshotFor('enterprise');
        expect(snap.remaining(1000)).toBe(Number.POSITIVE_INFINITY);
    });
});
