/**
 * Native WebAuthn / passkey scaffold for the Blackout API.
 *
 * This module ships the parts of WebAuthn that are safe in isolation:
 *
 *   - Random challenge generation with TTL.
 *   - Challenge consumption (single-use, time-bounded, RP-bound).
 *   - clientDataJSON shape + origin + type + challenge-match validation.
 *   - Credential record storage shape.
 *
 * The cryptographic verification of attestation and assertion signatures is
 * intentionally NOT implemented here — that surface is large (CBOR parsing,
 * COSE key decoding, ES256/EdDSA signature verification, attestation
 * statement formats, MDS root trust) and should be delegated to a vetted
 * library such as @simplewebauthn/server in a focused, security-reviewed
 * follow-up. Until then this module returns `{ ok: false,
 * code: 'verification_not_implemented' }` from `verifyAttestation` and
 * `verifyAssertion`, and the whole feature is gated behind
 * WEBAUTHN_ENABLED=1.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

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
    clientDataJSON: string;
    attestationObject: string;
    expectedChallenge: string;
    config: WebAuthnConfig;
}

export interface AssertionVerifyInput {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    credentialId: string;
    expectedChallenge: string;
    config: WebAuthnConfig;
}

export type VerifyResult =
    | { ok: true; credentialId: string; publicKeyCose?: string; signCount?: number }
    | { ok: false; code: string; detail?: string };

/**
 * Server-side attestation verification. NOT IMPLEMENTED — needs CBOR
 * decoding of attestationObject, COSE key extraction, attestation-statement
 * verification, and rpIdHash check. Track in TODO(WEBAUTHN-VERIFY).
 */
export const verifyAttestation = (input: AttestationVerifyInput): VerifyResult => {
    const cd = parseClientData(input.clientDataJSON);
    if (!cd) return { ok: false, code: 'malformed_client_data' };
    const validation = validateClientData(cd, {
        type: 'webauthn.create',
        challenge: input.expectedChallenge,
        origins: input.config.expectedOrigins,
    });
    if (!validation.ok) return validation;
    return { ok: false, code: 'verification_not_implemented' };
};

export const verifyAssertion = (input: AssertionVerifyInput): VerifyResult => {
    const cd = parseClientData(input.clientDataJSON);
    if (!cd) return { ok: false, code: 'malformed_client_data' };
    const validation = validateClientData(cd, {
        type: 'webauthn.get',
        challenge: input.expectedChallenge,
        origins: input.config.expectedOrigins,
    });
    if (!validation.ok) return validation;
    if (!findCredential(input.credentialId)) {
        return { ok: false, code: 'unknown_credential' };
    }
    return { ok: false, code: 'verification_not_implemented' };
};

export const __test__ = { challenges, credentials, safeChallengeEquals };
