/**
 * A release key set: the public identity and the private halves that go
 * with it, as the device stores them and the recovery file carries them.
 *
 * The X25519 pair comes from the dead-drop suite's `generateRecipientKeyPair`
 * and the ML-KEM-768 pair from the configured KEM provider (the client calls
 * `setKemProvider(mlKem768Provider)` at startup; the default provider throws,
 * so nothing is made with a zero-strength KEM). Ed25519 is WebCrypto's.
 *
 * The private keys are extractable JWKs and raw bytes, because the recovery
 * file has to hold them; any code running in the app's origin can read them.
 */

import {
    deriveSharedSecret,
    generateEphemeralKeyPair,
    generateRecipientKeyPair,
    importRecipientPrivateKey,
    importRecipientPublicKey,
} from '../deaddrop/crypto/keys';
import { getKemProvider, type KemProvider } from '../deaddrop/crypto/pqHybrid';
import { randomBytes } from '../deaddrop/crypto/random';
import {
    asBufferSource,
    bytesEqual,
    concatBytes,
    decodeBase64Url,
    decodeCanonicalBase64,
    labelBytes,
    subtleCrypto,
    toBase64,
    toBase64Url,
} from './bytes';
import {
    ED25519_PUBLIC_KEY_BYTES,
    MLKEM768_PUBLIC_KEY_BYTES,
    RELEASE_ACCOUNT_ID_PATTERN,
    RELEASE_IDENTITY_VERSION,
    X25519_PUBLIC_KEY_BYTES,
    signReleaseIdentity,
    verifyReleaseIdentity,
    type ReleaseIdentity,
} from './identity';

export const MLKEM768_SECRET_KEY_BYTES = 2400;
const MLKEM768_CIPHERTEXT_BYTES = 1088;
const MLKEM768_SHARED_SECRET_BYTES = 32;
/** Offset of the encapsulation key inside an ML-KEM-768 decapsulation key (FIPS 203: dkPKE ‖ ek ‖ H(ek) ‖ z). */
const MLKEM768_SECRET_KEY_EK_OFFSET = 1152;

/**
 * Signed only on the device, to check that a stored Ed25519 private key is
 * the one its identity names. Its own label keeps it from ever being an
 * identity or release signature; it never leaves the device.
 */
export const RELEASE_KEY_CHECK_LABEL = 'blackout-release-key-check-v1';

/** An Ed25519 or X25519 private key as a JWK with exactly these members. */
export type ReleaseOkpPrivateJwk = {
    kty: 'OKP';
    crv: 'Ed25519' | 'X25519';
    /** The private key, unpadded base64url, 32 bytes. */
    d: string;
    /** The public key, unpadded base64url, 32 bytes. */
    x: string;
};

export type ReleaseKeySet = {
    identity: ReleaseIdentity;
    /** SHA-256 of the identity's signed bytes, lowercase hex. */
    fingerprint: string;
    signingPrivateJwk: ReleaseOkpPrivateJwk;
    x25519PrivateJwk: ReleaseOkpPrivateJwk;
    /** ML-KEM-768 decapsulation key, standard base64, 2400 bytes. */
    mlkem768SecretKey: string;
    /** When the device created the keys (ISO 8601). */
    createdAt: string;
};

/** Why a stored key set cannot be used. */
export type ReleaseKeySetProblem =
    | 'shape'
    | 'identity'
    | 'fingerprint'
    | 'signing_private_key'
    | 'x25519_private_key'
    | 'mlkem768_secret_key'
    | 'kem_provider';

const okpJwk = (jwk: JsonWebKey, crv: ReleaseOkpPrivateJwk['crv']): ReleaseOkpPrivateJwk | null => {
    if (jwk.kty !== 'OKP' || jwk.crv !== crv) return null;
    if (!decodeBase64Url(jwk.d, 32) || !decodeBase64Url(jwk.x, 32)) return null;
    return { kty: 'OKP', crv, d: jwk.d as string, x: jwk.x as string };
};

const assertMlKem768 = (kem: KemProvider): void => {
    if (
        kem.publicKeyLength !== MLKEM768_PUBLIC_KEY_BYTES ||
        kem.secretKeyLength !== MLKEM768_SECRET_KEY_BYTES ||
        kem.ciphertextLength !== MLKEM768_CIPHERTEXT_BYTES ||
        kem.sharedSecretLength !== MLKEM768_SHARED_SECRET_BYTES
    ) {
        throw new Error('release keys need an ML-KEM-768 KEM provider');
    }
};

/**
 * Create a key set on this device for `accountId`: generate the three pairs,
 * sign the identity, and check the result the way anyone receiving it would.
 */
export const createReleaseKeySet = async (
    accountId: string,
    now: Date = new Date()
): Promise<ReleaseKeySet> => {
    if (!RELEASE_ACCOUNT_ID_PATTERN.test(accountId)) {
        throw new Error('release keys: the account id is not in the allowed form');
    }
    const kem = getKemProvider();
    assertMlKem768(kem);

    const signing = (await subtleCrypto().generateKey(
        { name: 'Ed25519' } as unknown as AlgorithmIdentifier,
        true,
        ['sign', 'verify']
    )) as CryptoKeyPair;
    const signingPublic = new Uint8Array(await subtleCrypto().exportKey('raw', signing.publicKey));
    const signingJwk = okpJwk(await subtleCrypto().exportKey('jwk', signing.privateKey), 'Ed25519');
    const x25519 = await generateRecipientKeyPair();
    const x25519Jwk = okpJwk(x25519.privateKeyJwk, 'X25519');
    const pq = await kem.generateKeyPair();
    if (!signingJwk || !x25519Jwk) {
        throw new Error('release keys: WebCrypto exported a private key in an unexpected form');
    }
    if (
        signingPublic.length !== ED25519_PUBLIC_KEY_BYTES ||
        pq.publicKey.length !== MLKEM768_PUBLIC_KEY_BYTES ||
        pq.secretKey.length !== MLKEM768_SECRET_KEY_BYTES
    ) {
        throw new Error('release keys: a generated key has the wrong length');
    }

    const identity = await signReleaseIdentity(
        {
            v: RELEASE_IDENTITY_VERSION,
            accountId,
            signingKey: toBase64(signingPublic),
            x25519Key: x25519.publicKeyBase64,
            mlkem768Key: toBase64(pq.publicKey),
        },
        signing.privateKey
    );
    const keySet: ReleaseKeySet = {
        identity,
        fingerprint: '',
        signingPrivateJwk: signingJwk,
        x25519PrivateJwk: x25519Jwk,
        mlkem768SecretKey: toBase64(pq.secretKey),
        createdAt: now.toISOString(),
    };
    const check = await verifyReleaseIdentity(identity, { accountId });
    if (!check.ok) {
        throw new Error(`release keys: the new identity failed its own check (${check.problem})`);
    }
    keySet.fingerprint = check.fingerprint;
    const problem = await checkReleaseKeySet(keySet, { accountId });
    if (problem) throw new Error(`release keys: the new key set failed its own check (${problem})`);
    return keySet;
};

// Only the four members are ever imported, whatever else a stored JWK holds.
const jwkMembers = (jwk: ReleaseOkpPrivateJwk): JsonWebKey => ({
    kty: jwk.kty,
    crv: jwk.crv,
    d: jwk.d,
    x: jwk.x,
});

/** Import a key set's Ed25519 private key for signing. */
export const importReleaseSigningKey = (keySet: ReleaseKeySet): Promise<CryptoKey> =>
    subtleCrypto().importKey(
        'jwk',
        jwkMembers(keySet.signingPrivateJwk),
        { name: 'Ed25519' } as unknown as AlgorithmIdentifier,
        false,
        ['sign']
    );

/** Import a key set's X25519 private key for key agreement. */
export const importReleaseX25519Key = (keySet: ReleaseKeySet): Promise<CryptoKey> =>
    importRecipientPrivateKey(jwkMembers(keySet.x25519PrivateJwk));

const signingKeyMatches = async (
    keySet: ReleaseKeySet,
    publicKey: Uint8Array
): Promise<boolean> => {
    if (keySet.signingPrivateJwk.x !== toBase64Url(publicKey)) return false;
    try {
        const privateKey = await importReleaseSigningKey(keySet);
        const message = concatBytes(labelBytes(RELEASE_KEY_CHECK_LABEL), randomBytes(32));
        const signature = await subtleCrypto().sign(
            { name: 'Ed25519' } as unknown as AlgorithmIdentifier,
            privateKey,
            asBufferSource(message)
        );
        const verifier = await subtleCrypto().importKey(
            'raw',
            asBufferSource(publicKey),
            { name: 'Ed25519' } as unknown as AlgorithmIdentifier,
            false,
            ['verify']
        );
        return subtleCrypto().verify(
            { name: 'Ed25519' } as unknown as AlgorithmIdentifier,
            verifier,
            signature,
            asBufferSource(message)
        );
    } catch {
        return false;
    }
};

// X25519 with the stored private key against a fresh key, and with the fresh
// key against the identity's key, agree only if the private key is the
// identity's (up to the clamping X25519 applies anyway).
const x25519KeyMatches = async (keySet: ReleaseKeySet, publicKey: Uint8Array): Promise<boolean> => {
    if (keySet.x25519PrivateJwk.x !== toBase64Url(publicKey)) return false;
    try {
        const privateKey = await importReleaseX25519Key(keySet);
        const identityKey = await importRecipientPublicKey(toBase64(publicKey));
        const fresh = await generateEphemeralKeyPair();
        const freshPublic = await importRecipientPublicKey(toBase64(fresh.publicKeyBytes));
        const one = await deriveSharedSecret(privateKey, freshPublic);
        const other = await deriveSharedSecret(fresh.privateKey, identityKey);
        return bytesEqual(one, other) && one.some((byte) => byte !== 0);
    } catch {
        return false;
    }
};

// The decapsulation key embeds the encapsulation key (FIPS 203), and a
// round trip through the provider must open. An encapsulation that throws is
// the provider failing (the default one throws on everything), not the key.
const mlKemKeyMatches = async (
    kem: KemProvider,
    secretKey: Uint8Array,
    publicKey: Uint8Array
): Promise<'yes' | 'no' | 'provider'> => {
    const embedded = secretKey.subarray(
        MLKEM768_SECRET_KEY_EK_OFFSET,
        MLKEM768_SECRET_KEY_EK_OFFSET + MLKEM768_PUBLIC_KEY_BYTES
    );
    if (!bytesEqual(embedded, publicKey)) return 'no';
    let encapsulation: Awaited<ReturnType<KemProvider['encapsulate']>>;
    try {
        encapsulation = await kem.encapsulate(publicKey);
    } catch {
        return 'provider';
    }
    try {
        const opened = await kem.decapsulate(encapsulation.ciphertext, secretKey);
        return bytesEqual(opened, encapsulation.sharedSecret) ? 'yes' : 'no';
    } catch {
        return 'no';
    }
};

export type CheckReleaseKeySetOptions = {
    /** Refuse the key set unless its identity names this account. */
    accountId?: string;
};

/**
 * Check a stored key set before using it: its identity verifies and has the
 * stated fingerprint, and each private key belongs to that identity. Node's
 * WebCrypto refuses a JWK whose `x` does not match its `d`; nothing says
 * every browser does, so this does not rely on it. Returns null when the set
 * is sound.
 */
export const checkReleaseKeySet = async (
    keySet: unknown,
    options: CheckReleaseKeySetOptions = {}
): Promise<ReleaseKeySetProblem | null> => {
    if (typeof keySet !== 'object' || keySet === null) return 'shape';
    const candidate = keySet as Partial<ReleaseKeySet>;
    if (
        typeof candidate.fingerprint !== 'string' ||
        typeof candidate.mlkem768SecretKey !== 'string' ||
        typeof candidate.createdAt !== 'string' ||
        Number.isNaN(Date.parse(candidate.createdAt)) ||
        !candidate.signingPrivateJwk ||
        !candidate.x25519PrivateJwk ||
        !okpJwk(candidate.signingPrivateJwk as JsonWebKey, 'Ed25519') ||
        !okpJwk(candidate.x25519PrivateJwk as JsonWebKey, 'X25519')
    ) {
        return 'shape';
    }
    const set = candidate as ReleaseKeySet;
    const check = await verifyReleaseIdentity(set.identity, options);
    if (!check.ok) return 'identity';
    if (check.fingerprint !== set.fingerprint) return 'fingerprint';

    const signingKey = decodeCanonicalBase64(set.identity.signingKey, ED25519_PUBLIC_KEY_BYTES);
    const x25519Key = decodeCanonicalBase64(set.identity.x25519Key, X25519_PUBLIC_KEY_BYTES);
    const mlkem768Key = decodeCanonicalBase64(set.identity.mlkem768Key, MLKEM768_PUBLIC_KEY_BYTES);
    const secretKey = decodeCanonicalBase64(set.mlkem768SecretKey, MLKEM768_SECRET_KEY_BYTES);
    if (!signingKey || !x25519Key || !mlkem768Key) return 'identity';
    if (!secretKey) return 'mlkem768_secret_key';

    if (!(await signingKeyMatches(set, signingKey))) return 'signing_private_key';
    if (!(await x25519KeyMatches(set, x25519Key))) return 'x25519_private_key';
    let kem: KemProvider;
    try {
        kem = getKemProvider();
        assertMlKem768(kem);
    } catch {
        return 'kem_provider';
    }
    const mlKem = await mlKemKeyMatches(kem, secretKey, mlkem768Key);
    if (mlKem === 'provider') return 'kem_provider';
    if (mlKem === 'no') return 'mlkem768_secret_key';
    return null;
};
