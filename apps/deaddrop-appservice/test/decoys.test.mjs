import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDecoy } from '../src/decoys.mjs';
import { isOpaqueEnvelope } from '../src/envelope.mjs';

const seed = new Uint8Array(32).fill(0xab);

test('decoy passes the opaque-envelope shape check', () => {
    const decoy = generateDecoy({
        seed,
        counter: 1,
        bucketBytes: 1024,
        paddingStrategy: 'bucket',
        expiresAt: '2030-01-01T00:00:00.000Z',
    });
    assert.equal(isOpaqueEnvelope(decoy), true);
});

test('decoys for the same (seed, counter, bucket) are deterministic', () => {
    const a = generateDecoy({
        seed,
        counter: 7,
        bucketBytes: 1024,
        paddingStrategy: 'bucket',
        expiresAt: '2030-01-01T00:00:00.000Z',
    });
    const b = generateDecoy({
        seed,
        counter: 7,
        bucketBytes: 1024,
        paddingStrategy: 'bucket',
        expiresAt: '2030-01-01T00:00:00.000Z',
    });
    assert.deepEqual(a, b);
});

test('decoys at the same bucket have identical ciphertext byte length', () => {
    const make = (counter) =>
        generateDecoy({
            seed,
            counter,
            bucketBytes: 1024,
            paddingStrategy: 'bucket',
            expiresAt: '2030-01-01T00:00:00.000Z',
        });
    const decoys = [make(1), make(2), make(3), make(4), make(5)];
    const lens = decoys.map((d) => d.ct.length);
    assert.equal(new Set(lens).size, 1, 'all decoys at same bucket must share ct byte length');
});

test('decoys at different counters differ in clue + ek + ct', () => {
    const a = generateDecoy({
        seed,
        counter: 1,
        bucketBytes: 256,
        paddingStrategy: 'minimal',
        expiresAt: '2030-01-01T00:00:00.000Z',
    });
    const b = generateDecoy({
        seed,
        counter: 2,
        bucketBytes: 256,
        paddingStrategy: 'minimal',
        expiresAt: '2030-01-01T00:00:00.000Z',
    });
    assert.notEqual(a.clue, b.clue);
    assert.notEqual(a.ek, b.ek);
    assert.notEqual(a.ct, b.ct);
});
