// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import {
    HARDENING_TIER_ENTITLEMENTS,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import {
    useHardeningFeatures,
    type HardeningFeaturesSnapshot,
} from '../../../../src/app/features/privacy-tools/useHardeningFeatures';

const payloadFor = (tier: EntitlementTier): EntitlementAccessPayload => ({
    deploymentPreset: 'starter',
    deploymentPresetEntitlements: HARDENING_TIER_ENTITLEMENTS[tier],
    orgTier: tier,
    orgTierEntitlements: HARDENING_TIER_ENTITLEMENTS[tier],
    planState: { tier, status: tier === 'free' ? 'inactive' : 'active', isPaid: tier !== 'free' },
});

let container: HTMLDivElement | null = null;

afterEach(() => {
    container?.remove();
    container = null;
});

const snapshotFor = async (tier: EntitlementTier): Promise<HardeningFeaturesSnapshot> => {
    container = document.createElement('div');
    document.body.appendChild(container);
    let captured: HardeningFeaturesSnapshot | undefined;
    const Probe: React.FC = () => {
        captured = useHardeningFeatures(payloadFor(tier));
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

describe('useHardeningFeatures', () => {
    it('free tier: enabled only, perturbation/tor/decoy gated', async () => {
        const snap = await snapshotFor('free');
        expect(snap.tier).toBe('free');
        expect(snap.enabled).toBe(true);
        expect(snap.imagePerturbation).toBe(false);
        expect(snap.torTransport).toBe(false);
        expect(snap.decoyTraffic).toBe(false);
    });

    it('pro tier unlocks perturbation (and the planned tor/decoy keys)', async () => {
        const snap = await snapshotFor('pro');
        expect(snap.imagePerturbation).toBe(true);
        expect(snap.torTransport).toBe(true);
        expect(snap.decoyTraffic).toBe(true);
    });
});
