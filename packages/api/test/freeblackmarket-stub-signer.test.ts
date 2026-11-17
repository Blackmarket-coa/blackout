// How the stub marketplace signs plugin bundles (createStubBundleSigner).
//
// A production build of the client refuses HMAC keys since 2026-11-17, so the
// stub's development key works only with a development build. A demo running
// the stub behind a production build gives the stub an Ed25519 key and pins
// its public half; these tests check that bundle the way the client does.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
delete process.env.FREEBLACKMARKET_STUB_SIGNING_KEY_FILE;
delete process.env.FREEBLACKMARKET_STUB_SIGNING_KEY_ID;
delete process.env.BLACKOUT_PLUGIN_DEV_HMAC;

const { createStubBundleSigner, createFreeblackmarketStubProvider } = await import(
    '../src/integrations/marketplace/freeblackmarketStub'
);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stub-signer-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const writeKey = (name: string, key: crypto.KeyObject): string => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, key.export({ type: 'pkcs8', format: 'pem' }));
    return file;
};

function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
        .join(',')}}`;
}

const sha256Hex = (input: string | Uint8Array): string =>
    crypto.createHash('sha256').update(input).digest('hex');

test('without a key file it signs with the development HMAC key', () => {
    const signer = createStubBundleSigner({});
    assert.equal(signer.keyId, 'fbm-dev-hmac');
    const expected = crypto
        .createHmac('sha256', Buffer.from('6465762d68616d63', 'hex'))
        .update('a:b')
        .digest('hex');
    assert.equal(signer.sign('a:b'), expected);
});

test('with an Ed25519 key file it signs with that key under the configured id', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const signer = createStubBundleSigner({
        FREEBLACKMARKET_STUB_SIGNING_KEY_FILE: writeKey('demo.pem', privateKey),
        FREEBLACKMARKET_STUB_SIGNING_KEY_ID: 'demo-2026-11',
    });
    assert.equal(signer.keyId, 'demo-2026-11');
    const signature = Buffer.from(signer.sign('manifest:bundle'), 'base64');
    assert.equal(signature.length, 64);
    assert.equal(crypto.verify(null, Buffer.from('manifest:bundle'), publicKey, signature), true);
});

test('a key file needs a plain key id, and must hold an Ed25519 key', () => {
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    const file = writeKey('ok.pem', privateKey);
    assert.throws(
        () => createStubBundleSigner({ FREEBLACKMARKET_STUB_SIGNING_KEY_FILE: file }),
        /FREEBLACKMARKET_STUB_SIGNING_KEY_ID must name the key/
    );
    assert.throws(
        () =>
            createStubBundleSigner({
                FREEBLACKMARKET_STUB_SIGNING_KEY_FILE: file,
                FREEBLACKMARKET_STUB_SIGNING_KEY_ID: 'has space',
            }),
        /FREEBLACKMARKET_STUB_SIGNING_KEY_ID must name the key/
    );
    const x25519 = writeKey('x25519.pem', crypto.generateKeyPairSync('x25519').privateKey);
    assert.throws(
        () =>
            createStubBundleSigner({
                FREEBLACKMARKET_STUB_SIGNING_KEY_FILE: x25519,
                FREEBLACKMARKET_STUB_SIGNING_KEY_ID: 'demo',
            }),
        /must hold an Ed25519 private key/
    );
});

test('the bundle it issues checks out the way the client checks it', async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    process.env.FREEBLACKMARKET_STUB_SIGNING_KEY_FILE = writeKey('bundle.pem', privateKey);
    process.env.FREEBLACKMARKET_STUB_SIGNING_KEY_ID = 'demo-2026-11';
    try {
        const provider = createFreeblackmarketStubProvider();
        const bundle = await provider.issueSignedBundle!({
            providerListingId: 'stub-theme-noir',
        } as never);
        const bytes = Buffer.from(bundle.bundleBase64, 'base64');
        assert.equal(bundle.signature.keyId, 'demo-2026-11');
        assert.equal(bundle.signature.sha256, sha256Hex(bytes));
        assert.equal(bundle.signature.manifestSha256, sha256Hex(canonicalJson(bundle.manifest)));
        const payload = `${bundle.signature.manifestSha256}:${bundle.signature.sha256}`;
        assert.equal(
            crypto.verify(
                null,
                Buffer.from(payload),
                publicKey,
                Buffer.from(bundle.signature.signature, 'base64')
            ),
            true
        );
    } finally {
        delete process.env.FREEBLACKMARKET_STUB_SIGNING_KEY_FILE;
        delete process.env.FREEBLACKMARKET_STUB_SIGNING_KEY_ID;
    }
});
