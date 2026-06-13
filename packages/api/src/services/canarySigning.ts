/**
 * Warrant-canary signing (OSS-manifest group G9).
 *
 * Signs the canonical canary statement with an Ed25519 key so clients can
 * cryptographically verify authenticity (not just the sha256 integrity digest).
 * The operator supplies a 32-byte Ed25519 seed via BLACKOUT_CANARY_SIGNING_KEY
 * (base64). In dev/test, an ephemeral per-process key is generated so the
 * endpoint always signs and is verifiable; in production without a configured
 * key, signing degrades gracefully to `unconfigured` (the digest still ships).
 */

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  type KeyObject,
} from 'node:crypto';

// PKCS#8 DER prefix for an Ed25519 private key; the 32-byte seed is appended to
// build a KeyObject from a raw operator-supplied seed.
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

export type CanaryKeySource = 'configured' | 'ephemeral' | 'unconfigured';

export type CanarySignature = {
  algorithm: 'ed25519';
  keySource: CanaryKeySource;
  /** base64 Ed25519 signature, or null when no key is available (prod). */
  signature: string | null;
  /** base64 SPKI (DER) public key for verification, or null. */
  publicKey: string | null;
};

type LoadedKey = { privateKey: KeyObject; keySource: CanaryKeySource } | { keySource: 'unconfigured' };

let cached: LoadedKey | null = null;

const loadKey = (): LoadedKey => {
  if (cached) return cached;

  const seedB64 = process.env.BLACKOUT_CANARY_SIGNING_KEY?.trim();
  if (seedB64) {
    const seed = Buffer.from(seedB64, 'base64');
    if (seed.length !== 32) {
      throw new Error(
        'BLACKOUT_CANARY_SIGNING_KEY must be a base64-encoded 32-byte Ed25519 seed.',
      );
    }
    const der = Buffer.concat([PKCS8_ED25519_PREFIX, seed]);
    cached = {
      privateKey: createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }),
      keySource: 'configured',
    };
    return cached;
  }

  // No operator key. In production we never invent one — the canary ships
  // unsigned (digest only) so the absence of a signature is itself visible.
  if ((process.env.NODE_ENV ?? 'development') === 'production') {
    cached = { keySource: 'unconfigured' };
    return cached;
  }

  // Dev/test: a stable per-process ephemeral key keeps signing verifiable.
  const { privateKey } = generateKeyPairSync('ed25519');
  cached = { privateKey, keySource: 'ephemeral' };
  return cached;
};

const publicKeyB64 = (privateKey: KeyObject): string =>
  createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).toString('base64');

/** Sign the canonical canary string. */
export const signCanary = (canonical: string): CanarySignature => {
  const key = loadKey();
  if (key.keySource === 'unconfigured') {
    return { algorithm: 'ed25519', keySource: 'unconfigured', signature: null, publicKey: null };
  }
  const signature = cryptoSign(null, Buffer.from(canonical, 'utf8'), key.privateKey).toString('base64');
  return {
    algorithm: 'ed25519',
    keySource: key.keySource,
    signature,
    publicKey: publicKeyB64(key.privateKey),
  };
};

/** Test-only reset of the cached key. */
export const __resetCanaryKeyForTest = (): void => {
  cached = null;
};
