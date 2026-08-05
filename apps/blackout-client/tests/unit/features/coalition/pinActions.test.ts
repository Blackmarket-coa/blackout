import { describe, expect, it } from 'vitest';
import {
    directionsHref,
    resolvePinActions,
} from '../../../../src/app/features/coalition/map/pinActions';

const ids = (actions: ReturnType<typeof resolvePinActions>) => actions.map((a) => a.id);

const base = { hasDen: false, hasCoordinates: true, hasMedia: false } as const;

describe('resolvePinActions', () => {
    /**
     * A map you can only look at isn't a world. Every pin with a real position
     * can at least send you there.
     */
    it('always offers directions for a pin with coordinates', () => {
        expect(ids(resolvePinActions({ ...base, layer: 'gardens' }))).toContain('directions');
    });

    it('offers no directions for a pin whose coordinates are missing', () => {
        expect(
            ids(resolvePinActions({ ...base, layer: 'gardens', hasCoordinates: false }))
        ).not.toContain('directions');
    });

    it('offers watch on a story that actually has media', () => {
        expect(ids(resolvePinActions({ ...base, layer: 'video', hasMedia: true }))).toContain(
            'watch'
        );
    });

    it('withholds watch from a story with no media rather than offering a dead button', () => {
        expect(ids(resolvePinActions({ ...base, layer: 'video', hasMedia: false }))).not.toContain(
            'watch'
        );
    });

    it('names the den verb after what the layer actually is', () => {
        const aid = resolvePinActions({ ...base, layer: 'aid', hasDen: true });
        const vendor = resolvePinActions({ ...base, layer: 'vendors', hasDen: true });
        expect(aid.find((a) => a.id === 'den')?.label).toBe('Open the thread');
        expect(vendor.find((a) => a.id === 'den')?.label).toBe('Message vendor');
    });

    it('withholds the den verb when the pin has no den', () => {
        expect(ids(resolvePinActions({ ...base, layer: 'aid', hasDen: false }))).not.toContain(
            'den'
        );
    });

    it('still offers a den link on a layer with no catalogue entry', () => {
        const actions = resolvePinActions({ ...base, layer: 'infra', hasDen: true });
        expect(ids(actions)).toContain('den');
        // …and only once, never duplicated by the fallback.
        expect(ids(actions).filter((id) => id === 'den')).toHaveLength(1);
    });

    it('leads with the layer-specific verb before directions', () => {
        const actions = resolvePinActions({ ...base, layer: 'events', hasDen: true });
        expect(actions[0].id).toBe('den');
        expect(actions[0].primary).toBe(true);
    });

    it('returns nothing actionable for a bare pin with no position or den', () => {
        expect(
            resolvePinActions({
                layer: 'jobs',
                hasDen: false,
                hasCoordinates: false,
                hasMedia: false,
            })
        ).toEqual([]);
    });
});

describe('directionsHref', () => {
    it('builds a geo: URI so the device picks its own map app', () => {
        expect(directionsHref(51.5, -0.12)).toBe('geo:51.5,-0.12');
    });

    it('escapes a label into the query', () => {
        expect(directionsHref(51.5, -0.12, 'Tool library & shed')).toBe(
            'geo:51.5,-0.12?q=Tool%20library%20%26%20shed'
        );
    });
});
