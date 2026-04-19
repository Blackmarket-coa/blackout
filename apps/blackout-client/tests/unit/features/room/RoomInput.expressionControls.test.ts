import { describe, expect, it } from 'vitest';
import { getExpressionControlVisibility } from '../../../../src/app/features/room/expressionControls';

describe('RoomInput expression controls visibility', () => {
    it('keeps all expression controls discoverable at desktop widths', () => {
        expect(getExpressionControlVisibility(900)).toEqual({
            hideStickerBtn: false,
            hideGifBtn: false,
        });
    });

    it('keeps at least one expression trigger visible on narrow mobile widths', () => {
        const narrow = getExpressionControlVisibility(360);

        expect(narrow.hideStickerBtn).toBe(true);
        expect(narrow.hideGifBtn).toBe(true);
    });
});
