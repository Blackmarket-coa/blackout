/**
 * With `KT_WITNESS_ED25519_SEED` set, the STH the route serves is signed by
 * that witness and `/verify-sth` reports `signed: true`; a tampered root is
 * neither ok nor signed. Its own file because the witness is resolved when
 * the route module loads.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.KT_WITNESS_ED25519_SEED = randomBytes(32).toString('hex');
delete process.env.KT_LOG_FILE;

const { default: app } = await import('../src/index');
const { ed25519Witness } = await import('../src/services/keyTransparency');

const verifySth = async (sth: unknown) =>
    (await (
        await app.request('/v1/key-transparency/verify-sth', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sth }),
        })
    ).json()) as { ok: boolean; signed: boolean };

test('the served STH is signed by the configured witness and verify-sth says signed', async () => {
    const sth = (await (await app.request('/v1/key-transparency/sth')).json()) as {
        scheme: string;
        signature: string;
        witnessKey: string;
        rootHash: string;
    };
    assert.equal(sth.scheme, 'ed25519');
    assert.notEqual(sth.signature, '');
    const expectedKey = ed25519Witness(
        Buffer.from(process.env.KT_WITNESS_ED25519_SEED!, 'hex')
    ).publicKey;
    assert.equal(sth.witnessKey, expectedKey, 'the public key in the STH is the seed’s');

    assert.deepEqual(await verifySth(sth), { ok: true, signed: true });
    assert.deepEqual(await verifySth({ ...sth, rootHash: 'A'.repeat(43) }), {
        ok: false,
        signed: false,
    });
});
