import { describe, expect, it } from 'vitest';
import { __testables } from '../../src/app/plugins/react-prism/ReactPrism';

const { stripLanguagePrefix, resolveLanguage } = __testables;

describe('stripLanguagePrefix', () => {
    it('extracts the bare language id from a "language-X" class', () => {
        expect(stripLanguagePrefix('language-ts')).toBe('ts');
        expect(stripLanguagePrefix('language-typescript')).toBe('typescript');
    });

    it('matches even when other classes are present', () => {
        expect(stripLanguagePrefix('foo bar language-go baz')).toBe('go');
    });

    it('lowercases', () => {
        expect(stripLanguagePrefix('language-RUST')).toBe('rust');
    });

    it('returns empty for unrelated className', () => {
        expect(stripLanguagePrefix('hljs syntax')).toBe('');
        expect(stripLanguagePrefix(undefined)).toBe('');
        expect(stripLanguagePrefix('')).toBe('');
    });
});

describe('resolveLanguage', () => {
    it('aliases common short forms to canonical Shiki names', () => {
        expect(resolveLanguage('rs')).toBe('rust');
        expect(resolveLanguage('js')).toBe('javascript');
        expect(resolveLanguage('ts')).toBe('typescript');
        expect(resolveLanguage('py')).toBe('python');
        expect(resolveLanguage('sh')).toBe('bash');
        expect(resolveLanguage('yml')).toBe('yaml');
        expect(resolveLanguage('md')).toBe('markdown');
    });

    it('returns canonical names in the curated set verbatim', () => {
        expect(resolveLanguage('go')).toBe('go');
        expect(resolveLanguage('typescript')).toBe('typescript');
    });

    it('falls back to plaintext for languages outside the curated set', () => {
        // Heavy/uncurated grammars (cpp, emacs-lisp, ...) and unknown ids
        // render as plain text rather than throwing.
        expect(resolveLanguage('cpp')).toBe('text');
        expect(resolveLanguage('not-a-real-lang')).toBe('text');
    });

    it('uses plaintext fallback for the empty string', () => {
        expect(resolveLanguage('')).toBe('text');
    });
});
