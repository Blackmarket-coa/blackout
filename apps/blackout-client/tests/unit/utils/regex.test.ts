import { describe, expect, it } from 'vitest';
import {
    EMAIL_REGEX,
    JUMBO_EMOJI_REG,
    URL_REG,
    sanitizeForRegex,
} from '../../../src/app/utils/regex';

describe('sanitizeForRegex', () => {
    it('escapes regex metacharacters', () => {
        expect(sanitizeForRegex('a.b*c')).toBe('a\\.b\\*c');
        expect(sanitizeForRegex('(x)[y]')).toBe('\\(x\\)\\[y\\]');
    });

    it('escapes hyphens as \\x2d', () => {
        expect(sanitizeForRegex('a-b')).toBe('a\\x2db');
    });

    it('produces a pattern that matches the input literally', () => {
        const unsafe = 'price: $5.00 (USD)';
        const re = new RegExp(sanitizeForRegex(unsafe));
        expect(re.test(unsafe)).toBe(true);
        expect(re.test('price: $500 USD')).toBe(false);
    });
});

describe('URL_REG', () => {
    it('matches http(s) urls within text', () => {
        const matches = 'visit https://example.com/path now'.match(URL_REG);
        expect(matches).toContain('https://example.com/path');
    });

    it('does not match plain words', () => {
        expect('just some words'.match(URL_REG)).toBeNull();
    });
});

describe('EMAIL_REGEX', () => {
    it('accepts valid addresses', () => {
        expect(EMAIL_REGEX.test('user@example.com')).toBe(true);
        expect(EMAIL_REGEX.test('first.last@sub.domain.org')).toBe(true);
    });

    it('rejects invalid addresses', () => {
        expect(EMAIL_REGEX.test('not-an-email')).toBe(false);
        expect(EMAIL_REGEX.test('missing@tld')).toBe(false);
    });
});

describe('JUMBO_EMOJI_REG', () => {
    it('matches a short run of emoji', () => {
        expect(JUMBO_EMOJI_REG.test('😀')).toBe(true);
    });

    it('does not match ordinary text', () => {
        expect(JUMBO_EMOJI_REG.test('hello there')).toBe(false);
    });
});
