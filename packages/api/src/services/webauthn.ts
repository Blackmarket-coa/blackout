/**
 * Native WebAuthn / passkey verification for the Blackout API.
 *
 * Cryptographic verification is delegated to `@simplewebauthn/server`,
 * which handles CBOR decoding of the attestationObject, COSE_Key
 * extraction, rpIdHash check, attestation-statement format verification
 * (`packed`, `none`, `tpm`, `android-key`, `apple`, `fido-u2f`), signature
 * verification (ES256, EdDSA, RS256, …), and sign-counter monotonicity.
 *
 * In addition to the library's checks, this module:
 *
 *   - Issues / consumes single-use, time-bounded challenges with strict
 *     user + purpose binding (independent of the library).
 *   - Pre-validates clientDataJSON shape, origin allow-list, type
 *     pinning, cross-origin rejection — fast-failing before any CBOR
 *     parse.
 *   - Stores credentials and enforces sign-counter monotonicity to
 *     detect cloned authenticators.
 *
 * Feature flag remains: nothing happens unless `WEBAUTHN_ENABLED=1`.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
    verifyAuthenticationResponse,
    verifyRegistrationResponse,
    type AuthenticationResponseJSON,
    type RegistrationResponseJSON,
} from '@simplewebauthn/server';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export interface WebAuthnConfig {
    rpId: string;
    rpName: string;
    expectedOrigins: string[];
    enabled: boolean;
}

export const readWebAuthnConfig = (): WebAuthnConfig => {
    const enabled = process.env.WEBAUTHN_ENABLED === '1';
    const rpId = process.env.WEBAUTHN_RP_ID ?? '';
    const rpName = process.env.WEBAUTHN_RP_NAME ?? 'Blackout';
    const expectedOrigins = (process.env.WEBAUTHN_ORIGINS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return { enabled, rpId, rpName, expectedOrigins };
};

export interface ChallengeRecord {
    challenge: string; // base64url
    userId: string;
    purpose: 'register' | 'login';
    issuedAt: number;
}

const challenges = new Map<string, ChallengeRecord>();

export const issueChallenge = (
    userId: string,
    purpose: ChallengeRecord['purpose'],
    now = Date.now(),
): ChallengeRecord => {
    const challenge = randomBytes(32).toString('base64url');
    const record: ChallengeRecord = { challenge, userId, purpose, issuedAt: now };
    challenges.set(challenge, record);
    return record;
};

export const consumeChallenge = (
    challenge: string,
    expected: { userId: string; purpose: ChallengeRecord['purpose'] },
    now = Date.now(),
): ChallengeRecord | null => {
    const record = challenges.get(challenge);
    if (!record) return null;
    challenges.delete(challenge); // single-use
    if (record.userId !== expected.userId) return null;
    if (record.purpose !== expected.purpose) return null;
    if (now - record.issuedAt > CHALLENGE_TTL_MS) return null;
    return record;
};

export const purgeExpiredChallenges = (now = Date.now()) => {
    for (const [k, v] of challenges) {
        if (now - v.issuedAt > CHALLENGE_TTL_MS) challenges.delete(k);
    }
};

/** Decode the clientDataJSON sent by the authenticator (browser-side). */
export interface ClientData {
    type: string;
    challenge: string;
    origin: string;
    crossOrigin?: boolean;
}

export const parseClientData = (clientDataJSON: string): ClientData | null => {
    try {
        const decoded = Buffer.from(clientDataJSON, 'base64url').toString('utf8');
        const parsed = JSON.parse(decoded) as ClientData;
        if (typeof parsed.type !== 'string') return null;
        if (typeof parsed.challenge !== 'string') return null;
        if (typeof parsed.origin !== 'string') return null;
        return parsed;
    } catch {
        return null;
    }
};

export type ValidationResult =
    | { ok: true }
    | { ok: false; code: string; detail?: string };

const safeChallengeEquals = (a: string, b: string): boolean => {
    const aBuf = Buffer.from(a, 'utf8');
    const bBuf = Buffer.from(b, 'utf8');
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
};

export const validateClientData = (
    clientData: ClientData,
    expected: { type: 'webauthn.create' | 'webauthn.get'; challenge: string; origins: string[] },
): ValidationResult => {
    if (clientData.type !== expected.type) {
        return { ok: false, code: 'wrong_type', detail: clientData.type };
    }
    if (!safeChallengeEquals(clientData.challenge, expected.challenge)) {
        return { ok: false, code: 'challenge_mismatch' };
    }
    if (!expected.origins.includes(clientData.origin)) {
        return { ok: false, code: 'origin_not_allowed', detail: clientData.origin };
    }
    if (clientData.crossOrigin === true) {
        return { ok: false, code: 'cross_origin_disallowed' };
    }
    return { ok: true };
};

/** SHA-256 of the rpId, used in authenticatorData verification once implemented. */
export const rpIdHash = (rpId: string): Buffer => createHash('sha256').update(rpId).digest();

export interface PasskeyCredential {
    credentialId: string; // base64url
    userId: string;
    publicKeyCose: string; // base64url-encoded COSE key
    signCount: number;
    transports: string[];
    createdAt: number;
    lastUsedAt: number | null;
    label: string;
}

const credentials = new Map<string, PasskeyCredential>();

export const storeCredential = (cred: PasskeyCredential) => {
    credentials.set(cred.credentialId, cred);
};

export const findCredential = (credentialId: string): PasskeyCredential | undefined =>
    credentials.get(credentialId);

export const listCredentialsByUser = (userId: string): PasskeyCredential[] =>
    [...credentials.values()].filter((c) => c.userId === userId);

export interface AttestationVerifyInput {
    /** Full RegistrationResponseJSON as returned by `@simplewebauthn/browser`. */
    response: RegistrationResponseJSON;
    expectedChallenge: string;
    config: WebAuthnConfig;
}

export interface AssertionVerifyInput {
    /** Full AuthenticationResponseJSON as returned by `@simplewebauthn/browser`. */
    response: AuthenticationResponseJSON;
    expectedChallenge: string;
    config: WebAuthnConfig;
}

export type VerifyResult =
    | {
          ok: true;
          credentialId: string;
          publicKeyCose: string;
          signCount: number;
          transports: string[];
      }
    | { ok: false; code: string; detail?: string };

const toBase64Url = (bytes: Uint8Array): string =>
    Buffer.from(bytes).toString('base64url');

const fromBase64Url = (s: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(Buffer.from(s, 'base64url'));

/**
 * Server-side attestation verification. Delegates to
 * `@simplewebauthn/server` for CBOR / COSE / signature work, after our own
 * clientDataJSON pre-checks (which give clearer error codes for the most
 * common operator misconfigurations: wrong origin, wrong type, etc.).
 */
export const verifyAttestation = async (
    input: AttestationVerifyInput,
): Promise<VerifyResult> => {
    const cd = parseClientData(input.response.response.clientDataJSON);
    if (!cd) return { ok: false, code: 'malformed_client_data' };
    const validation = validateClientData(cd, {
        type: 'webauthn.create',
        challenge: input.expectedChallenge,
        origins: input.config.expectedOrigins,
    });
    if (!validation.ok) return validation;

    let verified;
    try {
        verified = await verifyRegistrationResponse({
            response: input.response,
            expectedChallenge: input.expectedChallenge,
            expectedOrigin: input.config.expectedOrigins,
            expectedRPID: input.config.rpId,
            requireUserVerification: false,
        });
    } catch (error) {
        return {
            ok: false,
            code: 'verification_failed',
            detail: (error as Error).message,
        };
    }

    if (!verified.verified || !verified.registrationInfo) {
        return { ok: false, code: 'verification_failed' };
    }

    const info = verified.registrationInfo;
    return {
        ok: true,
        credentialId: info.credential.id,
        publicKeyCose: toBase64Url(info.credential.publicKey),
        signCount: info.credential.counter,
        transports: info.credential.transports ?? [],
    };
};

/**
 * Server-side assertion verification. Looks up the stored credential,
 * delegates signature checking to `@simplewebauthn/server`, and persists
 * the new sign counter on success so that a cloned authenticator (counter
 * regression) is rejected on the next login.
 */
export const verifyAssertion = async (
    input: AssertionVerifyInput,
): Promise<VerifyResult> => {
    const cd = parseClientData(input.response.response.clientDataJSON);
    if (!cd) return { ok: false, code: 'malformed_client_data' };
    const validation = validateClientData(cd, {
        type: 'webauthn.get',
        challenge: input.expectedChallenge,
        origins: input.config.expectedOrigins,
    });
    if (!validation.ok) return validation;

    const stored = findCredential(input.response.id);
    if (!stored) return { ok: false, code: 'unknown_credential' };

    let verified;
    try {
        verified = await verifyAuthenticationResponse({
            response: input.response,
            expectedChallenge: input.expectedChallenge,
            expectedOrigin: input.config.expectedOrigins,
            expectedRPID: input.config.rpId,
            credential: {
                id: stored.credentialId,
                publicKey: fromBase64Url(stored.publicKeyCose),
                counter: stored.signCount,
                transports: stored.transports as never,
            },
            requireUserVerification: false,
        });
    } catch (error) {
        return {
            ok: false,
            code: 'verification_failed',
            detail: (error as Error).message,
        };
    }

    if (!verified.verified) return { ok: false, code: 'verification_failed' };

    const newCounter = verified.authenticationInfo.newCounter;
    // Clone detection: WebAuthn requires the counter to strictly increase
    // (unless the authenticator stays at 0 forever, which is allowed by spec).
    if (newCounter !== 0 && newCounter <= stored.signCount) {
        return { ok: false, code: 'sign_counter_regression' };
    }
    stored.signCount = newCounter;
    stored.lastUsedAt = Date.now();

    return {
        ok: true,
        credentialId: stored.credentialId,
        publicKeyCose: stored.publicKeyCose,
        signCount: stored.signCount,
        transports: stored.transports,
    };
};

export const __test__ = { challenges, credentials, safeChallengeEquals };
