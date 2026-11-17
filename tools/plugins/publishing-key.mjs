#!/usr/bin/env node
// Make and check the Ed25519 keys Blackout pins for marketplace plugin bundles.
//
//   node tools/plugins/publishing-key.mjs generate --key-id ID --out FILE
//       A new key pair: the private key to FILE (PKCS#8 PEM, readable by its
//       owner only; an existing file is never overwritten), and the lines that
//       pin its public half.
//   node tools/plugins/publishing-key.mjs public --key FILE --key-id ID
//       The pin lines for a key that already exists (FILE is its private or
//       public key, PEM), such as the one Free Black Market signs with now.
//   node tools/plugins/publishing-key.mjs verify --bundle FILE [--keys LIST | --client]
//       Check a signed bundle (the JSON the API serves at
//       /v1/marketplace/fulfillment/<id>/bundle) the way the client checks
//       it, against LIST (keyId:base64 entries, as in VITE_PLUGIN_PUBLISHING_KEYS)
//       or the keys pinned in the client's source (--client).
//
// The private key belongs to Free Black Market's bundle-signing setting, with
// the same key id, and nowhere else: whoever holds it can sign plugins every
// build pinning it will install. See
// docs/security/map-tiles-and-plugin-key-2026-11-17.md, P.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CLIENT_KEYS_FILE = path.join(
    ROOT,
    'apps/blackout-client/src/app/features/monetization/install/publishingKeys.ts'
);
const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export class UsageError extends Error {}

/** Base64 SPKI of an Ed25519 key, from a private or public key PEM. */
export function publicKeyFromPem(pem) {
    let key;
    try {
        key = crypto.createPublicKey(pem);
    } catch {
        throw new UsageError('the key file is not a PEM private or public key');
    }
    if (key.asymmetricKeyType !== 'ed25519') {
        throw new UsageError(`the key is ${key.asymmetricKeyType}, not Ed25519`);
    }
    return key.export({ type: 'spki', format: 'der' }).toString('base64');
}

export function isEd25519PublicKey(base64) {
    if (typeof base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return false;
    const bytes = Buffer.from(base64, 'base64');
    return bytes.length === 44 && bytes.subarray(0, 12).equals(ED25519_SPKI_PREFIX);
}

/** The keyId:base64 list format of VITE_PLUGIN_PUBLISHING_KEYS. */
export function parseKeyList(value) {
    const keys = [];
    for (const entry of String(value ?? '')
        .split(/[\s,]+/)
        .filter(Boolean)) {
        const colon = entry.indexOf(':');
        const keyId = colon > 0 ? entry.slice(0, colon) : '';
        const publicKey = colon > 0 ? entry.slice(colon + 1) : '';
        if (!KEY_ID.test(keyId) || !isEd25519PublicKey(publicKey)) {
            throw new UsageError(`not keyId:<base64 Ed25519 public key>: ${entry}`);
        }
        keys.push({ keyId, publicKey });
    }
    return keys;
}

/** The entries of PINNED_PUBLISHING_KEYS in the client's publishingKeys.ts. */
export function readClientKeys(source = fs.readFileSync(CLIENT_KEYS_FILE, 'utf8')) {
    const list = source.slice(source.indexOf('PINNED_PUBLISHING_KEYS'));
    const keys = [];
    for (const match of list.matchAll(
        /\{\s*keyId:\s*'([^']*)',\s*publicKey:\s*'([^']*)',?\s*\}/g
    )) {
        keys.push({ keyId: match[1], publicKey: match[2] });
    }
    return keys.filter((key) => KEY_ID.test(key.keyId) && isEd25519PublicKey(key.publicKey));
}

export function pinLines(keyId, publicKey) {
    return [
        `Key id:      ${keyId}`,
        `Public key:  ${publicKey}`,
        '',
        'To trust it in every build, add this line to PINNED_PUBLISHING_KEYS in',
        `${path.relative(ROOT, CLIENT_KEYS_FILE)}:`,
        `    { keyId: '${keyId}', publicKey: '${publicKey}' },`,
        '',
        'Or in one build only, set when it is built:',
        `    VITE_PLUGIN_PUBLISHING_KEYS=${keyId}:${publicKey}`,
    ].join('\n');
}

function canonicalJson(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
        .join(',')}}`;
}

const sha256Hex = (input) => crypto.createHash('sha256').update(input).digest('hex');

/**
 * The client's check (pluginSignature.ts, verifySignedBundle), for a
 * production build: Ed25519 only, the same reasons.
 */
export function verifyBundle(bundle, keys) {
    const signature = bundle?.signature ?? {};
    if (keys.length === 0) return { ok: false, reason: 'no-publishing-key' };
    const key = keys.find((entry) => entry.keyId === signature.keyId);
    if (!key) return { ok: false, reason: 'unknown-key-id' };
    if (sha256Hex(canonicalJson(bundle.manifest)) !== signature.manifestSha256) {
        return { ok: false, reason: 'manifest-sha-mismatch', keyId: key.keyId };
    }
    if (sha256Hex(Buffer.from(bundle.bundleBase64 ?? '', 'base64')) !== signature.sha256) {
        return { ok: false, reason: 'bundle-sha-mismatch', keyId: key.keyId };
    }
    const publicKey = crypto.createPublicKey({
        key: Buffer.from(key.publicKey, 'base64'),
        format: 'der',
        type: 'spki',
    });
    const verified = crypto.verify(
        null,
        Buffer.from(`${signature.manifestSha256}:${signature.sha256}`, 'utf8'),
        publicKey,
        Buffer.from(String(signature.signature ?? ''), 'base64')
    );
    return verified
        ? { ok: true, keyId: key.keyId }
        : { ok: false, reason: 'signature-mismatch', keyId: key.keyId };
}

function options(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--client') out.client = true;
        else if (['--key-id', '--out', '--key', '--bundle', '--keys'].includes(arg)) {
            if (i + 1 >= argv.length) throw new UsageError(`${arg} needs a value`);
            out[arg.slice(2)] = argv[(i += 1)];
        } else throw new UsageError(`unknown argument: ${arg}`);
    }
    return out;
}

function keyIdOption(opts) {
    if (!opts['key-id'] || !KEY_ID.test(opts['key-id'])) {
        throw new UsageError('--key-id is required: letters, digits, . _ - (at most 64)');
    }
    return opts['key-id'];
}

export function main(argv, io = { log: console.log }) {
    const [command, ...rest] = argv;
    const opts = options(rest);
    if (command === 'generate') {
        const keyId = keyIdOption(opts);
        if (!opts.out) throw new UsageError('--out FILE is required (the private key goes there)');
        const { privateKey } = crypto.generateKeyPairSync('ed25519');
        const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
        try {
            fs.writeFileSync(opts.out, pem, { mode: 0o600, flag: 'wx' });
        } catch (error) {
            if (error.code === 'EEXIST')
                throw new UsageError(`${opts.out} exists; not overwriting it`);
            throw error;
        }
        io.log(pinLines(keyId, publicKeyFromPem(pem)));
        io.log('');
        io.log(`The private key is in ${opts.out}, readable by its owner only. Give it to`);
        io.log(
            `Free Black Market's bundle-signing setting, with key id ${keyId}, and nowhere else.`
        );
        return 0;
    }
    if (command === 'public') {
        const keyId = keyIdOption(opts);
        if (!opts.key) throw new UsageError('--key FILE is required');
        io.log(pinLines(keyId, publicKeyFromPem(fs.readFileSync(opts.key))));
        return 0;
    }
    if (command === 'verify') {
        if (!opts.bundle) throw new UsageError('--bundle FILE is required');
        if (Boolean(opts.keys) === Boolean(opts.client)) {
            throw new UsageError('give the keys to check against: --keys LIST or --client');
        }
        const keys = opts.client ? readClientKeys() : parseKeyList(opts.keys);
        const bundle = JSON.parse(fs.readFileSync(opts.bundle, 'utf8'));
        const result = verifyBundle(bundle, keys);
        io.log(
            result.ok
                ? `OK: signed by ${result.keyId}`
                : `NOT OK: ${result.reason}${result.keyId ? ` (key ${result.keyId})` : ''}`
        );
        return result.ok ? 0 : 1;
    }
    throw new UsageError('say generate, public or verify (see the top of this file)');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        process.exitCode = main(process.argv.slice(2));
    } catch (error) {
        if (!(error instanceof UsageError)) throw error;
        console.error(`publishing-key: ${error.message}`);
        process.exitCode = 2;
    }
}
