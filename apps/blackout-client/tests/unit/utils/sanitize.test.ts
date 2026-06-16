import { describe, expect, it } from 'vitest';
import { sanitizeCustomHtml, sanitizeText } from '../../../src/app/utils/sanitize';

describe('sanitizeText', () => {
    it('escapes the five HTML-sensitive characters', () => {
        expect(sanitizeText(`<b>&"'`)).toBe('&lt;b&gt;&amp;&quot;&#39;');
    });

    it('leaves ordinary text untouched', () => {
        expect(sanitizeText('hello world')).toBe('hello world');
    });
});

describe('sanitizeCustomHtml', () => {
    it('keeps permitted formatting tags', () => {
        expect(sanitizeCustomHtml('<strong>hi</strong>')).toBe('<strong>hi</strong>');
    });

    it('discards script tags and their contents', () => {
        const out = sanitizeCustomHtml('<script>alert(1)</script>safe');
        expect(out).not.toContain('alert');
        expect(out).toContain('safe');
    });

    it('strips event-handler attributes', () => {
        const out = sanitizeCustomHtml('<p onclick="evil()">hi</p>');
        expect(out).not.toContain('onclick');
        expect(out).toContain('hi');
    });

    it('forces rel/target hardening on anchors', () => {
        const out = sanitizeCustomHtml('<a href="https://example.com">link</a>');
        expect(out).toContain('target="_blank"');
        expect(out).toContain('noopener');
    });

    it('drops javascript: hrefs', () => {
        const out = sanitizeCustomHtml('<a href="javascript:alert(1)">x</a>');
        expect(out).not.toContain('javascript:');
    });

    it('rewrites non-mxc images into links', () => {
        const out = sanitizeCustomHtml('<img src="https://example.com/a.png" alt="pic" />');
        expect(out).toContain('<a');
        expect(out).toContain('href="https://example.com/a.png"');
        expect(out).toContain('pic');
    });

    it('preserves mxc image sources', () => {
        const out = sanitizeCustomHtml('<img src="mxc://server/abc" alt="emoji" />');
        expect(out).toContain('src="mxc://server/abc"');
    });
});
