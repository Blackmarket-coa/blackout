// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { __testables } from '../../src/app/plugins/react-prism/ReactPrism';

const { applyHighlight, resolveLanguage } = __testables;

/**
 * In-repo regression guard for the Prism→Shiki swap. A full pixel-diff
 * baseline lives in the live-stack Playwright visual suite (needs a
 * browser + authenticated room); this asserts the structural contract
 * the CSS theming depends on: highlighted code gets the
 * `.shiki-highlighted` class and renders token `<span>`s carrying the
 * dual-theme CSS variables.
 */
describe('ReactPrism Shiki highlight output', () => {
    it('marks a highlighted <code> element and emits token spans (typescript)', async () => {
        const el = document.createElement('code');
        el.textContent = 'const x: number = 1;';
        await applyHighlight(el, el.textContent, resolveLanguage('ts'));

        expect(el.classList.contains('shiki-highlighted')).toBe(true);
        const spans = el.querySelectorAll('span');
        expect(spans.length).toBeGreaterThan(0);
        // defaultColor:false emits per-token `--shiki-dark` CSS vars that
        // ReactPrism.css selects on in dark mode.
        expect(el.innerHTML).toContain('--shiki-dark');
    });

    it('leaves plaintext intact for an unknown grammar (no throw)', async () => {
        const el = document.createElement('code');
        const original = 'just some text';
        el.textContent = original;
        await applyHighlight(el, original, resolveLanguage('not-a-real-lang'));
        // Shiki falls back internally; either it highlighted as plaintext
        // (class added) or the catch left the text — in both cases the
        // visible text must survive.
        expect(el.textContent).toContain('just some text');
    });
}, 30_000);
