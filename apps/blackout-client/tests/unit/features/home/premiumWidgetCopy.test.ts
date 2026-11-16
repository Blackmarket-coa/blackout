import { describe, expect, it } from 'vitest';
import { HARDENING_CAPABILITY_IMPLEMENTED } from '@blackout/protocol';
import { HOME_WIDGET_BY_ID } from '../../../../src/app/features/home/homeWidgets';

/**
 * The widget gallery shows each paid widget's description beside its unlock
 * button, so the description is purchase-adjacent copy. Until 2026-11-16 the
 * Privacy pulse's read "Live status of your anonymized transport, decoy
 * traffic, and hardening", for two capabilities with no implementation, and
 * the Coalition pulse's described data a placeholder widget does not show.
 * docs/security/trust-claims-2026-11-16.md.
 */
describe('paid home widgets describe only what they show', () => {
    it('the Privacy pulse says Tor transport and decoy traffic are not built, while they are not', () => {
        const { description } = HOME_WIDGET_BY_ID.premiumPrivacyPulse;
        expect(HARDENING_CAPABILITY_IMPLEMENTED.torTransport).toBe(false);
        expect(HARDENING_CAPABILITY_IMPLEMENTED.decoyTraffic).toBe(false);
        expect(description).toMatch(
            /Tor\) transport and decoy traffic are planned and not built yet/
        );
        expect(description).not.toMatch(/Live status of your anonymized transport/);
    });

    it('the Coalition pulse says it shows no data yet', () => {
        expect(HOME_WIDGET_BY_ID.premiumCoalitionPulse.description).toMatch(/shows no data yet/);
    });
});
