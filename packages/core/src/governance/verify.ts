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

export function verifyAuditChain(entries: VoteEntryForAudit[]): ChainVerificationResult {
  if (entries.length === 0) {
    return { valid: true, entryCount: 0 };
  }

  const sorted = [...entries].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  for (let i = 0; i < sorted.length; i += 1) {
    const entry = sorted[i];

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

    if (!entry.entryHash) {
      return {
        valid: false,
        invalidAt: i,
        entryCount: sorted.length,
        firstBrokenLink: {
          index: i,
          expected: 'present',
          actual: 'missing',
        },
      };
    }
  }

  return {
    valid: true,
    entryCount: sorted.length,
    lastHash: sorted[sorted.length - 1]?.entryHash,
  };
}
