import React, { MutableRefObject, ReactNode, useEffect, useRef } from 'react';
import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import githubLight from 'shiki/themes/github-light.mjs';
import githubDark from 'shiki/themes/github-dark-default.mjs';
import langBash from 'shiki/langs/bash.mjs';
import langC from 'shiki/langs/c.mjs';
import langCss from 'shiki/langs/css.mjs';
import langDiff from 'shiki/langs/diff.mjs';
import langGo from 'shiki/langs/go.mjs';
import langHtml from 'shiki/langs/html.mjs';
import langJava from 'shiki/langs/java.mjs';
import langJs from 'shiki/langs/javascript.mjs';
import langJson from 'shiki/langs/json.mjs';
import langJsx from 'shiki/langs/jsx.mjs';
import langKotlin from 'shiki/langs/kotlin.mjs';
import langMarkdown from 'shiki/langs/markdown.mjs';
import langPython from 'shiki/langs/python.mjs';
import langRuby from 'shiki/langs/ruby.mjs';
import langRust from 'shiki/langs/rust.mjs';
import langSql from 'shiki/langs/sql.mjs';
import langToml from 'shiki/langs/toml.mjs';
import langTsx from 'shiki/langs/tsx.mjs';
import langTypescript from 'shiki/langs/typescript.mjs';
import langYaml from 'shiki/langs/yaml.mjs';
import './ReactPrism.css';

/**
 * Code-block syntax highlighter. Render-prop API preserved for back-compat
 * with existing call sites in `react-custom-html-parser.tsx` and
 * `text-viewer/TextViewer.tsx` — callers render a `<code ref={ref}
 * className="language-X">` element and this component asynchronously
 * replaces its inner HTML with the highlighted output.
 *
 * Highlighter: Shiki via a **fine-grained** core highlighter — only the
 * curated grammars below are bundled (not Shiki's full ~200-language
 * bundle, which blew the dist size budget), and the JavaScript regex
 * engine is used instead of the Oniguruma WASM blob (~600 KB saved).
 * Languages outside the curated set render as plain text rather than
 * throwing.
 *
 * Themes are emitted with `defaultColor: false`, which outputs each token
 * as `<span style="color:var(--shiki-light); --shiki-dark:#...">`. The
 * `.prism-light` / `.prism-dark` class on the app root (see useTheme.ts)
 * selects which CSS variable is consumed; see ReactPrism.css for the
 * variable-swap rule.
 */

const THEME_LIGHT = 'github-light';
const THEME_DARK = 'github-dark-default';
const SHIKI_THEMES = { light: THEME_LIGHT, dark: THEME_DARK } as const;
const PLAINTEXT = 'text';

// Curated grammar set. Adding a language here is the ONLY way to widen
// coverage — keep an eye on the dist size budget (CI: MAX_BUNDLE_KB) since
// each grammar adds a chunk. Heavy grammars (cpp, emacs-lisp, wolfram) are
// intentionally excluded; they fall back to plain text.
const LANGS = [
    langBash,
    langC,
    langCss,
    langDiff,
    langGo,
    langHtml,
    langJava,
    langJs,
    langJson,
    langJsx,
    langKotlin,
    langMarkdown,
    langPython,
    langRuby,
    langRust,
    langSql,
    langToml,
    langTsx,
    langTypescript,
    langYaml,
];

// Canonical grammar names actually loaded above.
const CANONICAL_LANGS = new Set<string>([
    'bash',
    'c',
    'css',
    'diff',
    'go',
    'html',
    'java',
    'javascript',
    'json',
    'jsx',
    'kotlin',
    'markdown',
    'python',
    'ruby',
    'rust',
    'sql',
    'toml',
    'tsx',
    'typescript',
    'yaml',
]);

// Common short forms → canonical grammar names. Mapped explicitly rather
// than relying on each grammar's internal alias registration.
const LANG_ALIASES: Record<string, string> = {
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    h: 'c',
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    rs: 'rust',
    rb: 'ruby',
    kt: 'kotlin',
    yml: 'yaml',
    md: 'markdown',
};

const stripLanguagePrefix = (className: string | undefined): string => {
    if (!className) return '';
    const match = className.match(/(?:^|\s)language-([\w+-]+)/);
    return match?.[1]?.toLowerCase() ?? '';
};

const resolveLanguage = (raw: string): string => {
    if (!raw) return PLAINTEXT;
    const canonical = LANG_ALIASES[raw] ?? raw;
    return CANONICAL_LANGS.has(canonical) ? canonical : PLAINTEXT;
};

let highlighterPromise: Promise<HighlighterCore> | null = null;
const getHighlighter = (): Promise<HighlighterCore> => {
    if (!highlighterPromise) {
        highlighterPromise = createHighlighterCore({
            themes: [githubLight, githubDark],
            langs: LANGS,
            engine: createJavaScriptRegexEngine({ forgiving: true }),
        });
    }
    return highlighterPromise;
};

/**
 * Replace a `<code>` element's contents with Shiki's highlighted output.
 * Shiki returns a full `<pre><code>...</code></pre>` wrapper; we extract
 * just the inner `<code>` HTML so the caller's `<pre>` and class names stay.
 */
const applyHighlight = async (el: HTMLElement, code: string, lang: string) => {
    try {
        const highlighter = await getHighlighter();
        const html = highlighter.codeToHtml(code, {
            lang: resolveLanguage(lang),
            themes: SHIKI_THEMES,
            defaultColor: false,
        });
        const inner = new DOMParser().parseFromString(html, 'text/html').querySelector('code');
        if (!inner) return;
        el.innerHTML = inner.innerHTML;
        el.classList.add('shiki-highlighted');
    } catch {
        // Unknown grammar or transient load error — leave the plaintext
        // contents in place. An unhighlighted code block is still readable.
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
        const lang = stripLanguagePrefix(el.className);
        const code = el.textContent ?? '';
        let cancelled = false;
        void (async () => {
            if (cancelled) return;
            await applyHighlight(el, code, lang);
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    return <>{children(codeRef as MutableRefObject<null>)}</>;
}

// Re-exported for tests; not part of the rendered component's surface.
export const __testables = { stripLanguagePrefix, resolveLanguage, applyHighlight };
