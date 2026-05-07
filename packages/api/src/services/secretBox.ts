import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Symmetric encryption envelope used to protect OAuth tokens for third-party
 * platform links and the PKCE code_verifier of in-flight OAuth state. The
 * envelope format is:
 *
 *   <keyId>:<nonce_b64url>:<ciphertext_b64url>:<tag_b64url>
 *
 * The keyId lets us rotate without re-encrypting the table in bulk: the
 * primary key is used for every new encryption, and any number of rollover
 * keys remain valid for decryption.
 *
 * Configuration: LINKED_ACCOUNT_ENCRYPTION_KEYS is a comma-separated list of
 * `keyId:base64-32-bytes` entries. The first entry is the primary; the rest
 * are decrypt-only.
 */

const KEY_BYTES = 32; // AES-256
const NONCE_BYTES = 12; // GCM standard
const TAG_BYTES = 16;
const ALGO = 'aes-256-gcm';

export interface SecretBoxKey {
  id: string;
  bytes: Buffer;
}

export interface SecretBoxConfig {
  primary: SecretBoxKey;
  /** Includes the primary plus any rollover keys, indexed by id. */
  byId: Map<string, SecretBoxKey>;
}

const KEY_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

const parseKeyEntry = (raw: string, index: number): SecretBoxKey => {
  const sep = raw.indexOf(':');
  if (sep <= 0) {
    throw new Error(
      `LINKED_ACCOUNT_ENCRYPTION_KEYS[${index}] is malformed: expected "<keyId>:<base64-32-bytes>".`,
    );
  }
  const id = raw.slice(0, sep).trim();
  const b64 = raw.slice(sep + 1).trim();
  if (!KEY_ID_RE.test(id)) {
    throw new Error(
      `LINKED_ACCOUNT_ENCRYPTION_KEYS[${index}] keyId "${id}" must match ${KEY_ID_RE} (1-32 chars, [A-Za-z0-9_-]).`,
    );
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(b64, 'base64');
  } catch {
    throw new Error(`LINKED_ACCOUNT_ENCRYPTION_KEYS[${index}] is not valid base64.`);
  }
  if (bytes.length !== KEY_BYTES) {
    throw new Error(
      `LINKED_ACCOUNT_ENCRYPTION_KEYS[${index}] decoded to ${bytes.length} bytes; require exactly ${KEY_BYTES} (AES-256).`,
    );
  }
  return { id, bytes };
};

let cached: SecretBoxConfig | null = null;

export const readSecretBoxConfig = (): SecretBoxConfig => {
  if (cached) return cached;
  const raw = process.env.LINKED_ACCOUNT_ENCRYPTION_KEYS?.trim();
  if (!raw) {
    throw new Error(
      'LINKED_ACCOUNT_ENCRYPTION_KEYS is required: provide at least one "<keyId>:<base64-32-bytes>" entry.',
    );
  }
  const entries = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseKeyEntry);
  if (entries.length === 0) {
    throw new Error('LINKED_ACCOUNT_ENCRYPTION_KEYS parsed to zero keys.');
  }
  const byId = new Map<string, SecretBoxKey>();
  for (const key of entries) {
    if (byId.has(key.id)) {
      throw new Error(`LINKED_ACCOUNT_ENCRYPTION_KEYS contains duplicate keyId "${key.id}".`);
    }
    byId.set(key.id, key);
  }
  cached = { primary: entries[0], byId };
  return cached;
};

export const clearSecretBoxConfigCache = (): void => {
  cached = null;
};

const b64url = (input: Buffer): string => input.toString('base64url');
const fromB64url = (input: string): Buffer => Buffer.from(input, 'base64url');

export interface EncryptOptions {
  /** Optional additional authenticated data — bound to the ciphertext but not encrypted. */
  aad?: string;
}

export const encryptSecret = (plaintext: string, options: EncryptOptions = {}): string => {
  if (typeof plaintext !== 'string') {
    throw new TypeError('encryptSecret requires a string plaintext.');
  }
  const { primary } = readSecretBoxConfig();
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGO, primary.bytes, nonce);
  if (options.aad) cipher.setAAD(Buffer.from(options.aad, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${primary.id}:${b64url(nonce)}:${b64url(encrypted)}:${b64url(tag)}`;
};

export interface DecryptOptions {
  aad?: string;
}

export const decryptSecret = (envelope: string, options: DecryptOptions = {}): string => {
  if (typeof envelope !== 'string') {
    throw new TypeError('decryptSecret requires a string envelope.');
  }
  const parts = envelope.split(':');
  if (parts.length !== 4) {
    throw new Error('decryptSecret: malformed envelope (expected 4 colon-separated parts).');
  }
  const [keyId, nonceB64, ctB64, tagB64] = parts;
  const config = readSecretBoxConfig();
  const key = config.byId.get(keyId);
  if (!key) {
    throw new Error(`decryptSecret: unknown keyId "${keyId}". Add it to LINKED_ACCOUNT_ENCRYPTION_KEYS or rotate offline.`);
  }
  const nonce = fromB64url(nonceB64);
  const tag = fromB64url(tagB64);
  if (nonce.length !== NONCE_BYTES) {
    throw new Error(`decryptSecret: bad nonce length ${nonce.length}, expected ${NONCE_BYTES}.`);
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error(`decryptSecret: bad tag length ${tag.length}, expected ${TAG_BYTES}.`);
  }
  const decipher = createDecipheriv(ALGO, key.bytes, nonce);
  decipher.setAuthTag(tag);
  if (options.aad) decipher.setAAD(Buffer.from(options.aad, 'utf8'));
  const plaintext = Buffer.concat([decipher.update(fromB64url(ctB64)), decipher.final()]);
  return plaintext.toString('utf8');
};

/** Returns the keyId an envelope was encrypted with. Useful for re-encrypt-on-read rotation. */
export const envelopeKeyId = (envelope: string): string => {
  const sep = envelope.indexOf(':');
  if (sep <= 0) throw new Error('envelopeKeyId: malformed envelope.');
  return envelope.slice(0, sep);
};
