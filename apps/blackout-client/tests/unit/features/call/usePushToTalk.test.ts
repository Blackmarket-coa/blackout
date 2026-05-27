import { describe, expect, it } from 'vitest';
import { reducePtt } from '../../../../src/app/features/call/usePushToTalk';

describe('reducePtt', () => {
    it('opens the mic on first matching keydown', () => {
        expect(reducePtt(false, { kind: 'down', matches: true, inEditable: false })).toEqual({
            holding: true,
            setMuted: false,
            preventDefault: true,
        });
    });

    it('ignores auto-repeat keydown while already holding', () => {
        expect(reducePtt(true, { kind: 'down', matches: true, inEditable: false })).toEqual({
            holding: true,
            setMuted: null,
            preventDefault: true,
        });
    });

    it('does nothing for a non-matching key', () => {
        expect(reducePtt(false, { kind: 'down', matches: false, inEditable: false })).toEqual({
            holding: false,
            setMuted: null,
            preventDefault: false,
        });
    });

    it('does not transmit while typing in an editable element', () => {
        expect(reducePtt(false, { kind: 'down', matches: true, inEditable: true })).toEqual({
            holding: false,
            setMuted: null,
            preventDefault: false,
        });
    });

    it('closes the mic on keyup while holding', () => {
        expect(reducePtt(true, { kind: 'up', matches: true, inEditable: false })).toEqual({
            holding: false,
            setMuted: true,
            preventDefault: false,
        });
    });

    it('ignores keyup when not holding', () => {
        expect(reducePtt(false, { kind: 'up', matches: true, inEditable: false })).toEqual({
            holding: false,
            setMuted: null,
            preventDefault: false,
        });
    });
});
