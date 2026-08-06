import { describe, expect, it } from 'vitest';
import { resolvePinActions } from '../../../../src/app/features/coalition/map/pinActions';
import { layerStyleFor } from '../../../../src/app/features/coalition/tabs/solarpunkMap';
import { DEFAULT_LAYER_STYLE } from '../../../../src/app/features/coalition/tabs/solarpunkMap';

const base = { hasDen: false, hasCoordinates: true, hasMedia: false };

describe('pin verbs for the boards that gained coordinates', () => {
    it.each(['needs', 'projects', 'resources'] as const)(
        'offers a way onto the %s board',
        (layer) => {
            const actions = resolvePinActions({ ...base, layer });
            expect(actions.some((action) => action.id === 'board')).toBe(true);
        }
    );

    it('offers directions to an exact pin', () => {
        const actions = resolvePinActions({ ...base, layer: 'resources' });
        expect(actions.map((action) => action.id)).toContain('directions');
    });

    /**
     * Routing someone to the centre of a 25km service radius sends them to a
     * field, not to the thing.
     */
    it('withholds directions for an area of operations', () => {
        const actions = resolvePinActions({ ...base, layer: 'resources', isArea: true });
        expect(actions.map((action) => action.id)).not.toContain('directions');
        // The board is still reachable — the pin is not made useless.
        expect(actions.map((action) => action.id)).toContain('board');
    });
});

describe('the new layers are styled, not defaulted', () => {
    it.each(['needs', 'resources'] as const)('gives %s its own marker style', (layer) => {
        const style = layerStyleFor(layer);
        // A layer falling through to the default is invisible in the legend as
        // a distinct thing — every pin would look the same shade of lichen.
        expect(style.color).not.toBe(DEFAULT_LAYER_STYLE.color);
    });

    it('keeps needs and resources visually distinct from each other', () => {
        expect(layerStyleFor('needs').color).not.toBe(layerStyleFor('resources').color);
    });
});
