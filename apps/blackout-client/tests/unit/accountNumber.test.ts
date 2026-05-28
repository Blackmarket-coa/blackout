import { describe, expect, it } from 'vitest';
import {
    ACCOUNT_NUMBER_LENGTH,
    accountNumberToLocalpart,
    formatAccountNumber,
    generateAccountNumber,
    isValidAccountNumber,
    normalizeAccountNumber,
} from '@blackout/core';

// Matrix localpart charset (mirrors the API's MATRIX_LOCALPART_RE).
const LOCALPART_RE = /^[a-z0-9._=/+-]{1,255}$/;

describe('account number generation', () => {
    it('generates a valid, normalized 26-char base32 secret', () => {
        const n = generateAccountNumber();
        expect(n).toHaveLength(ACCOUNT_NUMBER_LENGTH);
        expect(n).toMatch(/^[a-z2-7]+$/);
        expect(isValidAccountNumber(n)).toBe(true);
    });

    it('generates distinct numbers', () => {
        expect(generateAccountNumber()).not.toBe(generateAccountNumber());
    });
});

describe('normalize/format', () => {
    it('normalizes case and separators', () => {
        expect(normalizeAccountNumber('B7K2-9Qx4 m2Ty')).toBe('b7k29qx4m2ty');
    });

    it('formats into 4-char groups that round-trip', () => {
        const n = generateAccountNumber();
        const formatted = formatAccountNumber(n);
        expect(formatted).toContain('-');
        expect(normalizeAccountNumber(formatted)).toBe(n);
    });

    it('rejects malformed numbers', () => {
        expect(isValidAccountNumber('too-short')).toBe(false);
        expect(isValidAccountNumber('0'.repeat(ACCOUNT_NUMBER_LENGTH))).toBe(false); // 0 not in base32
        expect(isValidAccountNumber('')).toBe(false);
    });
});

describe('accountNumberToLocalpart', () => {
    it('is deterministic and ignores formatting', async () => {
        const n = generateAccountNumber();
        const a = await accountNumberToLocalpart(n);
        const b = await accountNumberToLocalpart(formatAccountNumber(n).toUpperCase());
        expect(a).toBe(b);
    });

    it('produces a valid Matrix localpart starting with a letter', async () => {
        const lp = await accountNumberToLocalpart(generateAccountNumber());
        expect(lp).toMatch(LOCALPART_RE);
        expect(lp.startsWith('b')).toBe(true);
        expect(lp).toHaveLength(21);
    });

    it('is one-way: the localpart does not contain the secret', async () => {
        const n = generateAccountNumber();
        const lp = await accountNumberToLocalpart(n);
        expect(lp).not.toContain(n);
        expect(n).not.toContain(lp.slice(1));
    });

    it('maps different numbers to different localparts', async () => {
        const a = await accountNumberToLocalpart(generateAccountNumber());
        const b = await accountNumberToLocalpart(generateAccountNumber());
        expect(a).not.toBe(b);
    });
});
