/**
 * Clean-room per-conversation persona alias derivation (OSS-manifest G3).
 *
 * A persona has a 32-byte root key generated and held client-side only; the
 * server never sees it (it stores only a SHA-256 commitment for epoch
 * bookkeeping). Per-conversation aliases are derived deterministically with
 * HKDF-SHA-256, so the same persona presents a stable pseudonym within a
 * conversation without any server-side mapping:
 *
 *   alias = "@p-" + base32( HKDF(ikm=rootKey, salt=conversationId,
 *                                info="blackout/persona/alias/v1/<epoch>") )
 *
 * Compartments namespace the `info` string, yielding disjoint alias spaces
 * from the same root key with no extra key material. Rotation is a monotonic
 * `epoch` integer: bumping it re-derives every alias for new conversations
 * while historical aliases remain reproducible for decryption.
 *
 * All functions are pure/deterministic (modulo the explicit RNG in
 * `generatePersonaRootKey`) and fully unit-testable.
 */

import { hkdfSha256 } from '../deaddrop/crypto/hkdf';

const encoder = new TextEncoder();
const ALIAS_INFO_PREFIX = 'blackout/persona/alias/v1';
const COMPARTMENT_INFO_PREFIX = 'blackout/persona/compartment/v1';
const ALIAS_BYTES = 16;
const PERSONA_ROOT_KEY_BYTES = 32;

// Lowercase RFC 4648 base32 alphabet (no padding) — URL/handle safe.
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

const base32 = (bytes: Uint8Array): string => {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            out += BASE32_ALPHABET[(value >>> bits) & 31];
        }
        value &= (1 << bits) - 1;
    }
    if (bits > 0) {
        out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }
    return out;
};

const aliasInfo = (epoch: number, compartmentId?: string): Uint8Array =>
    encoder.encode(
        compartmentId
            ? `${COMPARTMENT_INFO_PREFIX}/${compartmentId}/${epoch}`
            : `${ALIAS_INFO_PREFIX}/${epoch}`
    );

/** 32 cryptographically-random bytes — the client-held persona root key. */
export const generatePersonaRootKey = (): Uint8Array => {
    const key = new Uint8Array(PERSONA_ROOT_KEY_BYTES);
    globalThis.crypto.getRandomValues(key);
    return key;
};

/** Lower-hex SHA-256 of the root key; the only thing the server persists. */
export const personaRootKeyCommitment = async (rootKey: Uint8Array): Promise<string> => {
    const digest = await globalThis.crypto.subtle.digest(
        'SHA-256',
        rootKey as unknown as BufferSource
    );
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

export type PersonaAliasInput = {
    /** 32-byte client-held persona root key. */
    rootKey: Uint8Array;
    /** Opaque conversation/room id the alias is scoped to. */
    conversationId: string;
    /** Monotonic rotation epoch (bumping it rotates aliases). */
    epoch: number;
    /** Optional compartment for disjoint alias namespacing. */
    compartmentId?: string;
};

/**
 * Deterministically derive the persona's pseudonymous handle for a
 * conversation. Same inputs ⇒ same alias; different epoch/compartment/
 * conversation ⇒ independent alias.
 */
export const derivePersonaAlias = async (input: PersonaAliasInput): Promise<string> => {
    if (input.rootKey.length !== PERSONA_ROOT_KEY_BYTES) {
        throw new Error(`persona root key must be ${PERSONA_ROOT_KEY_BYTES} bytes`);
    }
    if (!Number.isInteger(input.epoch) || input.epoch < 0) {
        throw new Error('persona alias epoch must be a non-negative integer');
    }
    const okm = await hkdfSha256(
        input.rootKey,
        encoder.encode(input.conversationId),
        aliasInfo(input.epoch, input.compartmentId),
        ALIAS_BYTES
    );
    return `@p-${base32(okm)}`;
};
