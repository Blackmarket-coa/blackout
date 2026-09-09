import { describe, expect, it } from 'vitest';
import { pulseState } from '../../../../src/app/features/home/widgets/premiumWidgets';
import { HARDENING_CAPABILITY_IMPLEMENTED } from '../../../../src/app/features/privacy-tools/useHardeningFeatures';

/**
 * The Privacy pulse widget reported "Anonymized transport (Tor) — active" to
 * entitled members under a heading that calls it live status, while the
 * hardening hook and the SDK gate both recorded Tor transport as planned and no
 * onion or SOCKS code existed anywhere in the repo.
 *
 * That is not a marketing overclaim like a missing feature elsewhere on the
 * board — it is a representation about network anonymity, made to people who
 * may decide what to say, and to whom, on the strength of it.
 * See TRANSMUTATION_NOTES.md §4.
 */
describe('privacy pulse state', () => {
    it('never reports an unimplemented capability as active, however entitled', () => {
        expect(pulseState(true, 'torTransport')).toBe('planned');
        expect(pulseState(true, 'decoyTraffic')).toBe('planned');
    });

    it('still reports an unimplemented capability as planned when unentitled', () => {
        expect(pulseState(false, 'torTransport')).toBe('planned');
    });

    it('reports an implemented capability from the entitlement', () => {
        expect(pulseState(true, 'imagePerturbation')).toBe('active');
        expect(pulseState(false, 'imagePerturbation')).toBe('off');
    });

    it('keeps the implemented map honest about what ships today', () => {
        expect(HARDENING_CAPABILITY_IMPLEMENTED).toEqual({
            imagePerturbation: true,
            torTransport: false,
            decoyTraffic: false,
        });
    });
});
