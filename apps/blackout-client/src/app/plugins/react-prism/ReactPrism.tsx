import React, { MutableRefObject, ReactNode, useEffect, useRef } from 'react';
import { codeToHtml, type BundledLanguage } from 'shiki';
import './ReactPrism.css';

/**
 * Code-block syntax highlighter. Render-prop API preserved for back-compat
 * with existing call sites in `react-custom-html-parser.tsx` and
 * `text-viewer/TextViewer.tsx` — callers render a `<code ref={ref}
 * className="language-X">` element and this component asynchronously
 * replaces its inner HTML with the highlighted output.
 *
 * Highlighter:
 *   - Previously: Prism.js + 250 grammar bundles imported at module load.
 *   - Now: Shiki, with grammars and themes lazy-fetched on first use of
 *     the language. Unknown languages fall back to plain text (no error).
 *
 * Themes are emitted with `defaultColor: false`, which outputs each token
 * as `<span style="color:var(--shiki-light); --shiki-dark:#...">`. The
 * `.prism-light` / `.prism-dark` class on the app root (see useTheme.ts)
 * selects which CSS variable is consumed; see ReactPrism.css for the
 * variable-swap rule.
 */

const SHIKI_THEMES = { light: 'github-light', dark: 'github-dark-default' } as const;

// Languages Shiki supports out-of-the-box. We don't gate on this — any
// missing language falls back to plaintext rather than throwing — but the
// list lets us short-circuit obvious aliases without a lookup.
const LANG_ALIASES: Record<string, BundledLanguage> = {
    rs: 'rust',
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    sh: 'bash',
    yml: 'yaml',
    md: 'markdown',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    rb: 'ruby',
    kt: 'kotlin',
};

const PLAINTEXT: BundledLanguage = 'text' as BundledLanguage;

const stripLanguagePrefix = (className: string | undefined): string => {
    if (!className) return '';
    const match = className.match(/(?:^|\s)language-([\w+-]+)/);
    return match?.[1]?.toLowerCase() ?? '';
};

const resolveLanguage = (raw: string): BundledLanguage => {
    if (!raw) return PLAINTEXT;
    if (raw in LANG_ALIASES) return LANG_ALIASES[raw];
    return raw as BundledLanguage;
};

/**
 * Replace a `<code>` element's contents with Shiki's highlighted output.
 *
 * Shiki returns a full `<pre><code>...</code></pre>` wrapper; we extract
 * just the inner `<code>` HTML so the caller's existing wrapping `<pre>`
 * and class names stay intact.
 */
const applyHighlight = async (el: HTMLElement, code: string, lang: BundledLanguage) => {
    try {
        const html = await codeToHtml(code, {
            lang,
            themes: SHIKI_THEMES,
            defaultColor: false,
        });
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const inner = doc.querySelector('code');
        if (!inner) return;
        el.innerHTML = inner.innerHTML;
        el.classList.add('shiki-highlighted');
    } catch {
        // Unknown grammar or transient load error — leave the plaintext
        // contents in place. Don't surface the failure: an unhighlighted
        // code block is still readable.
    }
};

export default function ReactPrism({
    children,
}: {
    children: (ref: MutableRefObject<null>) => ReactNode;
}) {
    const codeRef = useRef<HTMLElement>(null);

    useEffect(() => {
        const el = codeRef.current;
        if (!el) return undefined;
        const rawLang = stripLanguagePrefix(el.className);
        const lang = resolveLanguage(rawLang);
        const code = el.textContent ?? '';
        let cancelled = false;
        void (async () => {
            const html = await codeToHtml(code, {
                lang,
                themes: SHIKI_THEMES,
                defaultColor: false,
            }).catch(() => '');
            if (cancelled || !html) return;
            const inner = new DOMParser()
                .parseFromString(html, 'text/html')
                .querySelector('code');
            if (!inner) return;
            el.innerHTML = inner.innerHTML;
            el.classList.add('shiki-highlighted');
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    return <>{children(codeRef as MutableRefObject<null>)}</>;
}

// Re-exported for tests; not part of the rendered component's surface.
export const __testables = { stripLanguagePrefix, resolveLanguage, applyHighlight };
