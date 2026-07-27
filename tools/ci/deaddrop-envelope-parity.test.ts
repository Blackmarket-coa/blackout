/**
 * REAL cross-implementation parity test for the dead-drop envelope validator
 * (audit finding M18).
 *
 * The server-side envelope validator is hand-duplicated in two places:
 *   - packages/blackout-protocol/src/deaddrop/crypto/envelope.ts (the source of truth)
 *   - apps/deaddrop-appservice/src/envelope.mjs                  (the runtime guard)
 *
 * The pre-existing appservice test only pinned the appservice impl to a handful
 * of fixtures — it never executed the protocol implementation, so the two could
 * silently diverge (a metadata-leak risk: the appservice is what actually
 * rejects cleartext-smuggling submissions). This test imports BOTH validators
 * and asserts they return the identical verdict for every input in a broad
 * adversarial corpus. If either implementation drifts, this fails.
 *
 * Runs under tsx (so the TypeScript source can be imported directly), invoked
 * via `pnpm test:guard:deaddrop-parity`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as protocol from '../../packages/blackout-protocol/src/deaddrop/crypto/envelope.ts';
import * as appservice from '../../apps/deaddrop-appservice/src/envelope.mjs';

const v1 = (): Record<string, unknown> => ({
    v: 1,
    suite: 'sealedbox-x25519-aes256gcm-v1',
    pad: 'minimal',
    dropId: 'a'.repeat(32),
    clue: 'AAAA',
    ek: 'BBBB',
    nonce: 'CCCC',
    ct: 'DDDD',
    expiresAt: '2030-01-01T00:00:00.000Z',
});

const v2 = (): Record<string, unknown> => ({
    v: 2,
    suite: 'sealedbox-x25519-mlkem768-aes256gcm-v2',
    pad: 'bucket',
    dropId: 'b'.repeat(32),
    clue: 'AAAA',
    ek: 'BBBB',
    pqCt: 'EEEE',
    nonce: 'CCCC',
    ct: 'DDDD',
    expiresAt: '2030-01-01T00:00:00.000Z',
});

/** Build a broad corpus of valid + adversarially-mutated envelopes. */
function buildCorpus(): unknown[] {
    const corpus: unknown[] = [];

    // Non-object / primitive inputs.
    corpus.push(null, undefined, 'nope', 42, 0, true, false, [], [v1()], () => {});

    // Canonical valids.
    corpus.push(v1(), v2());

    for (const base of [v1, v2]) {
        // Drop each field one at a time.
        for (const key of Object.keys(base())) {
            const env = base();
            delete env[key];
            corpus.push(env);
        }
        // Empty-string each string field.
        for (const key of Object.keys(base())) {
            corpus.push({ ...base(), [key]: '' });
        }
        // Wrong-type each field.
        for (const key of Object.keys(base())) {
            for (const wrong of [null, 123, {}, [], true]) {
                corpus.push({ ...base(), [key]: wrong });
            }
        }
        // Unknown / smuggled-metadata fields.
        for (const extra of [
            'sender',
            'recipient',
            'plaintext',
            'bodyHint',
            '__proto__x',
            'from',
        ]) {
            corpus.push({ ...base(), [extra]: 'oops' });
        }
        // Invalid pad values.
        for (const badPad of ['none', 'MINIMAL', 'bucketx', 1, null]) {
            corpus.push({ ...base(), pad: badPad });
        }
    }

    // Version / suite cross-pairings.
    corpus.push({ ...v1(), v: 2 });
    corpus.push({ ...v2(), v: 1 });
    corpus.push({ ...v1(), suite: 'sealedbox-x25519-mlkem768-aes256gcm-v2' });
    corpus.push({ ...v2(), suite: 'sealedbox-x25519-aes256gcm-v1' });
    corpus.push({ ...v1(), v: '1' });
    corpus.push({ ...v2(), v: '2' });

    // v1 carrying the v2-only field, and v2 missing its defining field.
    corpus.push({ ...v1(), pqCt: 'EEEE' });
    const v2NoPq = v2();
    delete v2NoPq.pqCt;
    corpus.push(v2NoPq);

    // Unknown suite entirely.
    corpus.push({ ...v1(), suite: 'sealedbox-mystery-v9' });

    return corpus;
}

test('protocol and appservice envelope validators agree on the entire corpus (M18)', () => {
    const corpus = buildCorpus();
    assert.ok(corpus.length >= 80, `corpus should be broad, got ${corpus.length}`);

    let disagreements = 0;
    for (let i = 0; i < corpus.length; i++) {
        const input = corpus[i];
        const p = protocol.isOpaqueEnvelope(input);
        const a = appservice.isOpaqueEnvelope(input);
        if (p !== a) {
            disagreements++;
            console.error(
                `  divergence @${i}: protocol=${p} appservice=${a} input=${JSON.stringify(input)}`
            );
        }
        // Version-specific predicates must also agree.
        assert.equal(
            protocol.isOpaqueEnvelopeV1(input),
            appservice.isOpaqueEnvelopeV1(input),
            `V1 predicate diverged @${i}`
        );
        assert.equal(
            protocol.isOpaqueEnvelopeV2(input),
            appservice.isOpaqueEnvelopeV2(input),
            `V2 predicate diverged @${i}`
        );
    }
    assert.equal(disagreements, 0, `${disagreements} aggregate-verdict divergence(s) — see log`);
});

test('the corpus actually exercises both accept and reject paths', () => {
    const corpus = buildCorpus();
    const accepted = corpus.filter((x) => protocol.isOpaqueEnvelope(x)).length;
    // At least the two canonical valids are accepted; the vast majority rejected.
    assert.ok(accepted >= 2, 'corpus must include accepted envelopes');
    assert.ok(accepted < corpus.length, 'corpus must include rejected envelopes');
});
