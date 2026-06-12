import { describe, expect, it } from 'vitest';
import { perturbPixels } from '../../../../src/app/utils/perturbImage';

const makeBuffer = (width: number, height: number): Uint8ClampedArray => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
        // A gradient so edges exist for the edge-gate to act on.
        data[i * 4] = (i * 3) % 256;
        data[i * 4 + 1] = (i * 5) % 256;
        data[i * 4 + 2] = (i * 7) % 256;
        data[i * 4 + 3] = 200; // distinctive alpha
    }
    return data;
};

const AMPLITUDE = 8;

describe('perturbPixels', () => {
    it('is deterministic for identical inputs and dimensions', () => {
        const a = makeBuffer(16, 12);
        const b = makeBuffer(16, 12);
        perturbPixels(a, 16, 12, AMPLITUDE);
        perturbPixels(b, 16, 12, AMPLITUDE);
        expect(Array.from(a)).toEqual(Array.from(b));
    });

    it('keeps every RGB channel within ±amplitude of the input', () => {
        const original = makeBuffer(24, 24);
        const mutated = original.slice();
        perturbPixels(mutated, 24, 24, AMPLITUDE);
        for (let i = 0; i < original.length; i += 4) {
            for (const ch of [0, 1, 2]) {
                expect(Math.abs(mutated[i + ch] - original[i + ch])).toBeLessThanOrEqual(AMPLITUDE);
            }
        }
    });

    it('never modifies the alpha channel', () => {
        const original = makeBuffer(20, 20);
        const mutated = original.slice();
        perturbPixels(mutated, 20, 20, AMPLITUDE);
        for (let i = 3; i < original.length; i += 4) {
            expect(mutated[i]).toBe(original[i]);
        }
    });

    it('actually changes some pixels (non-trivial transform)', () => {
        const original = makeBuffer(32, 32);
        const mutated = original.slice();
        perturbPixels(mutated, 32, 32, AMPLITUDE);
        let changed = 0;
        for (let i = 0; i < original.length; i += 1) {
            if (mutated[i] !== original[i]) changed += 1;
        }
        expect(changed).toBeGreaterThan(0);
    });

    it('clamps amplitude to the [1, 8] band', () => {
        const original = makeBuffer(16, 16);
        const mutated = original.slice();
        perturbPixels(mutated, 16, 16, 9999);
        for (let i = 0; i < original.length; i += 4) {
            for (const ch of [0, 1, 2]) {
                expect(Math.abs(mutated[i + ch] - original[i + ch])).toBeLessThanOrEqual(8);
            }
        }
    });
});
