/**
 * Vote audit trail verification — pure functions usable by both server and client.
 *
 * WHAT THIS FILE DOES
 * Each vote stores two hashes: `entryHash` (SHA-256 of the vote content +
 * the previous vote's hash) and `previousHash` (pointer to the prior entry).
 * This creates a tamper-evident linked list. `verifyAuditChain()` walks the
 * chain recomputing every hash to confirm integrity. If any vote was modified
 * after being cast, the hashes won't match and the break point is detectable.
 *
 * WHAT WAS WRONG (THE CRITICAL BUG)
 * The original verifier checked that `entryHash` EXISTS and that `previousHash`
 * points correctly — but NEVER RECOMPUTED the hash. An attacker could change
 * a vote's choice, keep the old hash, and the chain would still pass verification.
 * Now it recomputes SHA-256(voteId + userId + choice + previousHash) for every
 * entry and compares against the stored hash.
 *
 * KEY CONCEPT — Hash chain
 * Like a chain of custody log: each link proves the previous link hasn't been
 * tampered with. Changing ANY link breaks every link after it, making the
 * point of tampering immediately detectable.
 */

export interface VoteEntryForAudit {
  voteId: string;
  userId: string;
  choice: string;
  entryHash?: string;
  previousHash?: string;
  createdAt: string;
}

export interface ChainVerificationResult {
  valid: boolean;
  invalidAt?: number;
  entryCount: number;
  lastHash?: string;
  firstBrokenLink?: { index: number; expected: string; actual: string };
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const buffer = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyAuditChain(entries: VoteEntryForAudit[]): Promise<ChainVerificationResult> {
  if (entries.length === 0) {
    return { valid: true, entryCount: 0 };
  }

  const sorted = [...entries].sort((a, b) => {
    const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.voteId.localeCompare(b.voteId);
  });

  for (let i = 0; i < sorted.length; i += 1) {
    const entry = sorted[i];

    // Recompute the hash from content and compare with stored entryHash
    const hashInput = `${entry.voteId}:${entry.userId}:${entry.choice}:${entry.previousHash ?? ''}`;
    const expectedHash = await sha256Hex(hashInput);

    if (entry.entryHash !== expectedHash) {
      return {
        valid: false,
        invalidAt: i,
        entryCount: sorted.length,
        lastHash: entry.entryHash,
        firstBrokenLink: {
          index: i,
          expected: expectedHash,
          actual: entry.entryHash ?? 'missing',
        },
      };
    }

    // Verify previousHash pointer to prior entry
    if (i > 0) {
      const expectedPrev = sorted[i - 1].entryHash;
      if (entry.previousHash !== expectedPrev) {
        return {
          valid: false,
          invalidAt: i,
          entryCount: sorted.length,
          lastHash: entry.entryHash,
          firstBrokenLink: {
            index: i,
            expected: expectedPrev ?? 'none',
            actual: entry.previousHash ?? 'none',
          },
        };
      }
    }
  }

  return {
    valid: true,
    entryCount: sorted.length,
    lastHash: sorted[sorted.length - 1]?.entryHash,
  };
}
