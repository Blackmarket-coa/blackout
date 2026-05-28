/**
 * Client-side proof-of-work solver for account-number creation.
 *
 * Computes a hashcash-style solution: finds a nonce such that
 * SHA-256(challenge + nonce) has at least `difficulty` leading zero bits.
 * Runs on the main thread in batches to avoid blocking the UI.
 *
 * Typical difficulty=16 takes ~1-2 seconds on modern hardware.
 */

const BATCH_SIZE = 10_000;

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
    token: string;
    attempts: number;
}

export async function solvePow(
    challenge: string,
    difficulty: number,
    onProgress?: (attempts: number) => void
): Promise<PowSolution> {
    let nonce = 0;
    let attempts = 0;

    while (true) {
        for (let i = 0; i < BATCH_SIZE; i += 1) {
            const candidate = `n${nonce}`;
            const hash = await sha256Hex(challenge + candidate);
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

        // Yield to the event loop every batch to avoid UI jank
        onProgress?.(attempts);
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}
