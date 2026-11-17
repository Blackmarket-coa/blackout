// node --test tools/plugins/publishing-key.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    CLIENT_KEYS_FILE,
    isEd25519PublicKey,
    main,
    parseKeyList,
    publicKeyFromPem,
    readClientKeys,
    UsageError,
    verifyBundle,
} from './publishing-key.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publishing-key-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const run = (...argv) => {
    const lines = [];
    const code = main(argv, { log: (line) => lines.push(line) });
    return { code, out: lines.join('\n') };
};

// A bundle signed the way Free Black Market signs one (canonical JSON written
// out here independently of the tool's own).
function signBundle(
    privateKey,
    keyId,
    payload = { kind: 'theme', payload: { accent: '#C66A2B' } }
) {
    const canonical = (value) =>
        value === null || typeof value !== 'object'
            ? JSON.stringify(value)
            : Array.isArray(value)
            ? `[${value.map(canonical).join(',')}]`
            : `{${Object.keys(value)
                  .sort()
                  .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
                  .join(',')}}`;
    const bytes = Buffer.from(JSON.stringify(payload));
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const manifest = { id: 'coop.example', name: 'Example', version: '1.0.0', sha256 };
    const manifestSha256 = crypto.createHash('sha256').update(canonical(manifest)).digest('hex');
    const signature = crypto
        .sign(null, Buffer.from(`${manifestSha256}:${sha256}`), privateKey)
        .toString('base64');
    return {
        manifest,
        bundleBase64: bytes.toString('base64'),
        signature: { keyId, signature, manifestSha256, sha256, issuedAt: '2026-11-17T00:00:00Z' },
    };
}

test('generate writes a private key only its owner can read, never over another file', () => {
    const out = path.join(dir, 'fbm.pem');
    const { code, out: printed } = run('generate', '--key-id', 'fbm-2026-11', '--out', out);
    assert.equal(code, 0);
    assert.equal(fs.statSync(out).mode & 0o777, 0o600);
    const publicKey = publicKeyFromPem(fs.readFileSync(out));
    assert.ok(isEd25519PublicKey(publicKey));
    assert.ok(printed.includes(`{ keyId: 'fbm-2026-11', publicKey: '${publicKey}' },`));
    assert.ok(printed.includes(`VITE_PLUGIN_PUBLISHING_KEYS=fbm-2026-11:${publicKey}`));
    assert.ok(!printed.includes('PRIVATE KEY'), 'the private key is never printed');

    const before = fs.readFileSync(out, 'utf8');
    assert.throws(() => run('generate', '--key-id', 'fbm-2026-11', '--out', out), /exists/);
    assert.equal(fs.readFileSync(out, 'utf8'), before);
});

test('public gives the same key from the private or the public PEM, and only for Ed25519', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const privateFile = path.join(dir, 'existing.pem');
    const publicFile = path.join(dir, 'existing.pub.pem');
    fs.writeFileSync(privateFile, privateKey.export({ type: 'pkcs8', format: 'pem' }));
    fs.writeFileSync(publicFile, publicKey.export({ type: 'spki', format: 'pem' }));
    const expected = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    assert.ok(run('public', '--key', privateFile, '--key-id', 'fbm-1').out.includes(expected));
    assert.ok(run('public', '--key', publicFile, '--key-id', 'fbm-1').out.includes(expected));

    const ecFile = path.join(dir, 'p256.pem');
    const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
    fs.writeFileSync(ecFile, ec.export({ type: 'pkcs8', format: 'pem' }));
    assert.throws(() => run('public', '--key', ecFile, '--key-id', 'fbm-1'), /not Ed25519/);
    assert.throws(() => run('public', '--key', privateFile, '--key-id', 'bad id'), UsageError);
});

test('verify agrees with the client: the right key passes, anything else says why', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const other = crypto.generateKeyPairSync('ed25519');
    const pin = (key) => `fbm-1:${key.export({ type: 'spki', format: 'der' }).toString('base64')}`;
    const keys = parseKeyList(pin(publicKey));
    const bundle = signBundle(privateKey, 'fbm-1');

    assert.deepEqual(verifyBundle(bundle, keys), { ok: true, keyId: 'fbm-1' });
    assert.equal(verifyBundle(bundle, []).reason, 'no-publishing-key');
    assert.equal(verifyBundle(signBundle(privateKey, 'fbm-2'), keys).reason, 'unknown-key-id');
    assert.equal(
        verifyBundle(signBundle(other.privateKey, 'fbm-1'), keys).reason,
        'signature-mismatch'
    );
    assert.equal(
        verifyBundle({ ...bundle, manifest: { ...bundle.manifest, name: 'Changed' } }, keys).reason,
        'manifest-sha-mismatch'
    );
    assert.equal(
        verifyBundle({ ...bundle, bundleBase64: Buffer.from('changed').toString('base64') }, keys)
            .reason,
        'bundle-sha-mismatch'
    );

    const file = path.join(dir, 'bundle.json');
    fs.writeFileSync(file, JSON.stringify(bundle));
    assert.deepEqual(run('verify', '--bundle', file, '--keys', pin(publicKey)), {
        code: 0,
        out: 'OK: signed by fbm-1',
    });
    assert.deepEqual(run('verify', '--bundle', file, '--keys', pin(other.publicKey)), {
        code: 1,
        out: 'NOT OK: signature-mismatch (key fbm-1)',
    });
});

test('the key list takes Ed25519 keys under plain ids, never an HMAC secret', () => {
    const key = crypto
        .generateKeyPairSync('ed25519')
        .publicKey.export({ type: 'spki', format: 'der' })
        .toString('base64');
    assert.deepEqual(parseKeyList(`a:${key}, b.c:${key}`), [
        { keyId: 'a', publicKey: key },
        { keyId: 'b.c', publicKey: key },
    ]);
    assert.throws(() => parseKeyList('fbm-dev-hmac:hmac:6465762d68616d63'), UsageError);
    assert.throws(() => parseKeyList(`bad/id:${key}`), UsageError);
});

test("reads the keys pinned in the client's source", () => {
    const key = crypto
        .generateKeyPairSync('ed25519')
        .publicKey.export({ type: 'spki', format: 'der' })
        .toString('base64');
    const source = [
        'export const PINNED_PUBLISHING_KEYS: readonly PluginPublishingKey[] = [',
        `    { keyId: 'fbm-2026-11', publicKey: '${key}' },`,
        "    { keyId: 'dev', publicKey: 'hmac:6465762d68616d63' },",
        '];',
    ].join('\n');
    assert.deepEqual(readClientKeys(source), [{ keyId: 'fbm-2026-11', publicKey: key }]);
    // The real file parses (it pins nothing until an operator adds a key).
    assert.ok(Array.isArray(readClientKeys(fs.readFileSync(CLIENT_KEYS_FILE, 'utf8'))));
});
