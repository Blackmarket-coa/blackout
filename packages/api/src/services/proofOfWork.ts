/**
 * WHAT THIS FILE DOES
 * Creates and verifies "proof-of-work" challenges to prevent automated
 * mass creation of accounts. Before creating an anonymous account, the
 * client must solve a math puzzle that takes about 1-2 seconds of
 * CPU time. This makes it expensive for attackers to create thousands
 * of accounts, while remaining fast enough for legitimate users.
 *
 * WHY IT EXISTS (THE SECURITY PROBLEM)
 * The anonymous account-number endpoint is intentionally unauthenticated
 * (no login required — that's the whole point of anonymous signup).
 * Without protection, an attacker could write a script that calls the
 * endpoint thousands of times to farm accounts. Rate limiting helps
 * but can be bypassed by rotating IP addresses. A proof-of-work
 * challenge makes each account creation cost ~1-2 seconds of CPU time
 * no matter how many IPs the attacker has.
 *
 * HOW IT WORKS (HASHCASH / BITCOIN-STYLE)
 * 1. Server creates a random challenge string and sends it to the client
 *    with a difficulty level (e.g., "find a nonce where the SHA-256 hash
 *    starts with 16 zero bits").
 * 2. Client tries different nonces (n0, n1, n2...) computing SHA-256
 *    of the challenge + nonce until it finds one with enough leading
 *    zero bits. This takes ~65,000 attempts on average for difficulty 16.
 * 3. Client sends the nonce back to the server.
 * 4. Server verifies the hash once (cheap) and, if valid, allows the
 *    account creation (expensive for Matrix provisioning — but the
 *    attacker had to pay the PoW cost first).
 * 5. The challenge is single-use (deleted on verification) and bound
 *    to the requester's IP via the map key, preventing the same
 *    solution from being reused by a different client.
 *
 * KEY CONCEPT — Proof of Work
 * A problem that is HARD to solve but EASY to verify. Think of a
 * jigsaw puzzle: putting it together takes an hour, but checking
 * that it's complete takes 2 seconds. The asymmetry is what makes it
 * useful — the attacker pays the high cost, the server pays the low cost.
 *
 * HOW TO VERIFY
 * 1. Call POST /v1/auth/account-number/pow-challenge → get challenge.
 * 2. Call POST /v1/auth/account-number WITHOUT solving → expect 428.
 * 3. Solve the challenge, send powToken → account created (201).
 * 4. Try the SAME powToken again → expect 428 (challenge already consumed).
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
