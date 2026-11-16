import { describe, expect, it } from 'vitest';
import {
    sanitizeFormattedBody,
    sanitizeMessageLinks,
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

// Used where messages leave the app, so every text message is covered, not
// only those typed in the message box. docs/security/trust-claims-2026-11-16.md, T12.
describe('sanitizeMessageLinks', () => {
    it('cleans the body and the formatted body of a text message, and keeps the rest', () => {
        const content = {
            msgtype: 'm.text',
            body: 'read https://news.example/a?id=7&utm_source=x',
            format: 'org.matrix.custom.html',
            formatted_body: '<a href="https://news.example/a?id=7&fbclid=y">read</a>',
            'm.relates_to': { rel_type: 'm.thread', event_id: '$root' },
        };
        expect(sanitizeMessageLinks(content)).toEqual({
            ...content,
            body: 'read https://news.example/a?id=7',
            formatted_body: '<a href="https://news.example/a?id=7">read</a>',
        });
    });

    it.each([['m.notice'], ['m.emote']])('cleans an %s too', (msgtype) => {
        const out = sanitizeMessageLinks({ msgtype, body: 'https://x.example/?gclid=1' });
        expect(out.body).toBe('https://x.example/');
    });

    it('leaves a file message alone: its body is the file name', () => {
        const content = { msgtype: 'm.file', body: 'https://x.example/?utm_source=a.txt' };
        expect(sanitizeMessageLinks(content)).toBe(content);
    });

    it('returns the same object when there is nothing to clean', () => {
        const content = { msgtype: 'm.text', body: 'no links here' };
        expect(sanitizeMessageLinks(content)).toBe(content);
    });
});
