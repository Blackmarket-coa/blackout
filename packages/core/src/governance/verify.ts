/**
 * Vote audit trail verification — pure functions usable by both server and client.
 *
 * Each vote entry includes an `entryHash` (SHA-256 of the vote content + previous hash)
 * and a `previousHash` pointing to the prior entry in the chain. This creates a
 * tamper-evident linked list: changing any entry breaks the hash chain, and the
 * break point is detectable.
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
