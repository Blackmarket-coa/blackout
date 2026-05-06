/**
 * Test-only random credential generator.
 *
 * Production startup rejects weak JWT secrets (see services/auth.ts:33). To
 * satisfy the strength check inside a test process we need a 32+ char value
 * with mixed character classes that is *not* on the weak-pattern blocklist.
 *
 * Generating it at module load instead of hard-coding a literal keeps
 * secret-shaped strings out of git history and out of static-scanning
 * tools like GitGuardian.
 */

import { randomBytes } from 'node:crypto';

const CHAR_CLASSES = ['lower', 'upper', 'digit', 'special'] as const;
const SPECIALS = '!@#$%^&*()-_=+[]{}';

const pickFromClass = (cls: (typeof CHAR_CLASSES)[number]): string => {
  switch (cls) {
    case 'lower':
      return String.fromCharCode(97 + (randomBytes(1)[0] % 26));
    case 'upper':
      return String.fromCharCode(65 + (randomBytes(1)[0] % 26));
    case 'digit':
      return String.fromCharCode(48 + (randomBytes(1)[0] % 10));
    case 'special':
      return SPECIALS.charAt(randomBytes(1)[0] % SPECIALS.length);
  }
};

/**
 * Returns a 48-byte base64url string suffixed with one character from each
 * required class. The base64url alphabet covers lower/upper/digit; we append
 * the four guarantee characters so the strength check never flakes on a
 * statistically unlikely all-lowercase prefix.
 */
export const generateTestJwtSecret = (): string => {
  const base = randomBytes(48).toString('base64url');
  const guarantees = CHAR_CLASSES.map(pickFromClass).join('');
  return `${base}${guarantees}`;
};

export const generateTestToken = (label: string): string =>
  `${label}-${randomBytes(16).toString('base64url')}`;
