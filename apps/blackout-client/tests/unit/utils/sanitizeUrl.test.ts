import { describe, expect, it } from 'vitest';
import {
    sanitizeFormattedBody,
    sanitizeUrl,
    sanitizeUrlsInText,
} from '../../../src/app/utils/sanitizeUrl';

describe('sanitizeUrl', () => {
    it('strips known tracking params', () => {
        expect(sanitizeUrl('https://example.com/page?fbclid=abc&gclid=def')).toBe(
            'https://example.com/page'
        );
    });

    it('strips utm_* params by prefix', () => {
        expect(
            sanitizeUrl('https://example.com/?utm_source=nl&utm_medium=email&utm_campaign=x')
        ).toBe('https://example.com/');
    });

    it('preserves functional params and fragments', () => {
        expect(sanitizeUrl('https://example.com/search?q=privacy&utm_source=x#top')).toBe(
            'https://example.com/search?q=privacy#top'
        );
    });

    it('leaves clean URLs untouched', () => {
        const clean = 'https://example.com/path?page=2';
        expect(sanitizeUrl(clean)).toBe(clean);
    });

    it('returns non-http(s) and malformed inputs unchanged', () => {
        expect(sanitizeUrl('not a url')).toBe('not a url');
        expect(sanitizeUrl('mailto:a@b.com?utm_source=x')).toBe('mailto:a@b.com?utm_source=x');
    });

    it('is case-insensitive on param names', () => {
        expect(sanitizeUrl('https://example.com/?FBCLID=abc&keep=1')).toBe(
            'https://example.com/?keep=1'
        );
    });
});

describe('sanitizeUrlsInText', () => {
    it('sanitizes every URL in a body and keeps surrounding text', () => {
        const input = 'see https://example.com/?utm_source=x and https://b.com/?gclid=y now';
        expect(sanitizeUrlsInText(input)).toBe('see https://example.com/ and https://b.com/ now');
    });

    it('preserves trailing sentence punctuation', () => {
        expect(sanitizeUrlsInText('visit https://example.com/?fbclid=z.')).toBe(
            'visit https://example.com/.'
        );
    });

    it('no-ops text without URLs', () => {
        expect(sanitizeUrlsInText('nothing to see here')).toBe('nothing to see here');
    });
});

describe('sanitizeFormattedBody', () => {
    it('sanitizes href attribute values', () => {
        const html = '<a href="https://example.com/?utm_source=x">link</a>';
        expect(sanitizeFormattedBody(html)).toBe('<a href="https://example.com/">link</a>');
    });
});
