/**
 * Proof-of-work challenge for the account-number endpoint.
 *
 * Uses a hashcash-style scheme: the client must find a nonce such that
 * SHA-256(challenge + nonce) has at least DIFFICULTY_BITS leading zero bits.
 * Challenges are bound to the requester's identity via composite map key.
 *
 * Challenges are stored in-memory with a 5-minute TTL. Each challenge is
 * single-use.
 *
 * TODO: Redis backing for multi-process deployments.
 */

import { createHash, randomBytes } from 'node:crypto';

const DEFAULT_DIFFICULTY = 16; // 16 leading zero bits (~65k hashes avg per solution)
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export interface PowChallenge {
    challenge: string;
    difficulty: number;
    expiresAt: number;
}

const challenges = new Map<string, PowChallenge>();

/** Clean expired challenges. */
setInterval(() => {
    const now = Date.now();
    for (const [key, challenge] of challenges) {
        if (now > challenge.expiresAt) challenges.delete(key);
    }
}, 60_000);

export function generateChallenge(userId: string, difficultyOverride?: number): PowChallenge {
    const difficulty = difficultyOverride ??
        (Number.parseInt(process.env.POW_DIFFICULTY_BITS ?? '', 10) || DEFAULT_DIFFICULTY);

    const challenge = randomBytes(16).toString('hex');
    const expiresAt = Date.now() + CHALLENGE_TTL_MS;
    const record: PowChallenge = { challenge, difficulty, expiresAt };

    // Key by composite (userId, challenge) — binds the solution to the identity
    challenges.set(`${userId}:${challenge}`, record);
    return { challenge, difficulty, expiresAt };
}

export function verifyPow(userId: string, challenge: string, nonce: string, difficulty: number): boolean {
    const key = `${userId}:${challenge}`;
    const record = challenges.get(key);
    if (!record || record.difficulty !== difficulty || Date.now() > record.expiresAt) {
        return false;
    }

    const hash = createHash('sha256').update(`${challenge}:${nonce}`).digest();
    const bits = countLeadingZeroBits(hash);

    if (bits >= difficulty) {
        challenges.delete(key); // single-use
        return true;
    }
    return false;
}

function countLeadingZeroBits(bytes: Buffer): number {
    let bits = 0;
    for (let i = 0; i < bytes.length; i += 1) {
        if (bytes[i] === 0) {
            bits += 8;
        } else {
            let byte = bytes[i];
            while ((byte & 0x80) === 0) {
                bits += 1;
                byte <<= 1;
            }
            break;
        }
    }
    return bits;
}
