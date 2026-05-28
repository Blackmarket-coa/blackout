/**
 * WHAT THIS FILE DOES
 * The client-side part of the proof-of-work challenge. When creating an
 * anonymous account, this code does the "heavy lifting" — it tries
 * different nonces until it finds a SHA-256 hash with enough leading
 * zero bits. This is the CPU-intensive work that deters attackers.
 *
 * WHY IT EXISTS (THE SECURITY PROBLEM)
 * The anonymous account-number endpoint has no login requirement. Without
 * a cost barrier, attackers can write scripts that create thousands of
 * accounts by just calling the endpoint repeatedly. Rate limiting helps
 * but can be bypassed with rotating IPs. A proof-of-work challenge makes
 * each account creation cost real CPU time (~1-2 seconds) no matter how
 * many IPs the attacker has.
 *
 * HOW IT WORKS (THE MATH)
 * 1. Server sends: { challenge: "abc123...", difficulty: 16 }
 * 2. This code tries nonce = "n0", computes SHA-256("abc123...:n0")
 *    → checks leading zero bits → not enough
 * 3. Tries "n1", "n2", "n3"... until it finds one where the SHA-256
 *    hash starts with 16 zero bits (~65,000 attempts on average)
 * 4. Returns { token: "abc123...:n42", nonce: "n42", attempts: 42 }
 * 5. Client sends the token to the server, which verifies it in one hash
 *
 * KEY CONCEPTS EXPLAINED
 * - SHA-256: A cryptographic hash function. Same input = same output.
 *   Different input = completely different output. One-way: you can't
 *   reverse the hash to find the input. Like a fingerprint for data.
 * - Leading zero bits: The first N bits of the hash are all 0. The
 *   higher the difficulty, the more zeros you need, the harder it is
 *   to find. Bitcoin uses this exact same concept.
 * - BATCH_SIZE: Instead of checking one nonce at a time (which would
 *   block the UI), we check 10,000 in a batch, then yield to the
 *   browser's event loop via `setTimeout(resolve, 0)`. This prevents
 *   the page from freezing during computation.
 * - MAX_ATTEMPTS: A safety limit (1,000,000) that prevents an infinite
 *   loop if the difficulty is impossibly high. After 1M attempts, it
 *   throws an error instead of running forever.
 *
 * HOW TO VERIFY
 * 1. Call solvePow("test-challenge", 16) → should return a solution
 *    in ~1-2 seconds.
 * 2. Call solvePow("test-challenge", 256) → should throw after
 *    MAX_ATTEMPTS (difficulty impossibly high).
 * 3. Check that the page doesn't freeze during solving (batches yield
 *    to the event loop).
 */

const BATCH_SIZE = 10_000;
const MAX_ATTEMPTS = 1_000_000;

function countLeadingZeroBits(hex: string): number {
    let bits = 0;
    for (let i = 0; i < hex.length; i += 1) {
        const nibble = parseInt(hex[i], 16);
        if (nibble === 0) {
            bits += 4;
        } else {
            if (!(nibble & 8)) bits += 1; else break;
            if (!(nibble & 4)) bits += 1; else break;
            if (!(nibble & 2)) bits += 1; else break;
            if (!(nibble & 1)) bits += 1; else break;
            break;
        }
    }
    return bits;
}

async function sha256Hex(input: string): Promise<string> {
    const encoded = new TextEncoder().encode(input);
    const buffer = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

export interface PowSolution {
    nonce: string;
    token: string; // userId:challenge:nonce
    attempts: number;
}

export async function solvePow(
    challenge: string,
    difficulty: number,
    onProgress?: (attempts: number) => void
): Promise<PowSolution> {
    let nonce = 0;
    let attempts = 0;

    while (attempts < MAX_ATTEMPTS) {
        for (let i = 0; i < BATCH_SIZE && attempts < MAX_ATTEMPTS; i += 1) {
            const candidate = `n${nonce}`;
            const hash = await sha256Hex(`${challenge}:${candidate}`);
            const bits = countLeadingZeroBits(hash);
            attempts += 1;

            if (bits >= difficulty) {
    return {
        nonce: candidate,
        token: `${challenge}:${candidate}`,
        attempts,
    };
            }
            nonce += 1;
        }

        if (attempts >= MAX_ATTEMPTS) break;

        // Yield to the event loop every batch to avoid UI jank
        onProgress?.(attempts);
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    throw new Error(`PoW solver exceeded ${MAX_ATTEMPTS} attempts without finding a solution. Difficulty ${difficulty} may be too high.`);
}
