// The glossary is shown as the tooltip of a term wherever it appears. Two of
// its entries described things the app does not do. "Dead drop" was "a way to
// hide ephemeral messages inside images that disappear after delivery":
// nothing in the app sends or opens a dead drop (T8), hiding a message in an
// image is steganography, and nothing disappears. A digital good was
// "delivered after purchase via an encrypted dead-drop": the buyer downloads
// it from Library, from the marketplace API.
// docs/security/trust-claims-2026-11-16.md, T15.
import { describe, expect, it } from 'vitest';
import { BLACKOUT_GLOSSARY } from '../../../src/app/lib/blackoutTerminology';

describe('glossary entries that describe a protection', () => {
    it('a dead drop is described as planned, not as something that happens', () => {
        expect(BLACKOUT_GLOSSARY.deaddrop).toBe(
            'A sealed message or file left for one person to collect later. Planned: nothing in the app sends or opens one yet.'
        );
    });

    it('a digital good says where the buyer gets it', () => {
        expect(BLACKOUT_GLOSSARY.digitalGood).not.toMatch(/dead.drop/i);
        expect(BLACKOUT_GLOSSARY.digitalGood).toContain(
            'After purchase, the buyer downloads it from Library in the black market.'
        );
    });

    it('no entry promises that something disappears', () => {
        for (const [key, text] of Object.entries(BLACKOUT_GLOSSARY)) {
            expect(text, key).not.toMatch(/disappear/i);
        }
    });
});
