#!/usr/bin/env node
/**
 * Render `TRUST.md` into the static public trust page served at
 * `https://theblackout.app/trust`.
 *
 * ## Why generate instead of writing the page by hand
 *
 * A trust page and a repo document making the same promises are the classic
 * drift pair: someone updates one, the other quietly becomes a lie, and the lie
 * is on the public one. `TRUST.md` is the single source; this produces the
 * public rendering, and `--check` fails CI when they diverge. The whole point of
 * the page is that its claims are true, so "these two files agree" has to be
 * mechanically enforced rather than remembered.
 *
 * ## Why a hand-written renderer instead of a markdown dependency
 *
 * The repo has no markdown library, and adding one to render exactly one
 * file we control is a poor trade against a lockfile, an OSV surface, and a
 * supply-chain review. This handles the subset `TRUST.md` actually uses.
 *
 * The safety property that makes that acceptable: **this renderer is strict.**
 * It throws on any construct it does not understand rather than emitting
 * something approximate. A build failure is a fine outcome; a trust page with a
 * silently mangled sentence is not. If you add markdown syntax to `TRUST.md`
 * that this does not cover, this fails loudly and you extend it.
 *
 * ## Link rewriting
 *
 * `TRUST.md` links repo-relative (`packages/api/src/...`) because it is read on
 * GitHub. Served from a web host those would 404, so relative targets are
 * rewritten to absolute GitHub blob URLs. This is the other reason generation
 * beats copying: the transformation is real work, not formatting.
 *
 * Usage:
 *   node tools/ci/build-trust-page.mjs            # write the page
 *   node tools/ci/build-trust-page.mjs --check    # fail if the page is stale
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SOURCE = 'TRUST.md';
const OUTPUT = 'apps/blackout-client/public/trust.html';
const NGINX_CONF = 'apps/blackout-client/docker-nginx.conf';
const NETLIFY_CONF = 'apps/blackout-client/netlify.toml';
const VITE_CONF = 'apps/blackout-client/vite.config.js';
const REPO_BLOB = 'https://github.com/Blackmarket-coa/blackout/blob/develop/';
const CANONICAL = 'https://theblackout.app/trust';

// ---------------------------------------------------------------------------
// Inline rendering
// ---------------------------------------------------------------------------

const escapeHtml = (value) =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

/**
 * Resolve a markdown link target for the public page. Absolute URLs and
 * in-page anchors pass through; anything else is a repo path and becomes a
 * GitHub blob URL.
 */
export function resolveHref(target) {
    if (/^(https?:)?\/\//.test(target) || target.startsWith('mailto:') || target.startsWith('#')) {
        return target;
    }
    return REPO_BLOB + target.replace(/^\.\//, '');
}

/**
 * Render inline markdown. Code spans are extracted first so their contents are
 * never treated as emphasis — `encryption_enabled_by_default_for_room_type`
 * must not turn into italics halfway through.
 */
export function renderInline(text, context = 'inline') {
    const codeSpans = [];
    let working = text.replace(/`([^`]+)`/g, (_match, code) => {
        codeSpans.push(code);
        return `@@CODE${codeSpans.length - 1}@@`;
    });

    working = escapeHtml(working);

    // Links before emphasis: link text may itself be bold or code.
    working = working.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label, target) => {
        const href = escapeHtml(resolveHref(target));
        const external = /^(https?:)?\/\//.test(resolveHref(target));
        const rel = external ? ' rel="noopener noreferrer"' : '';
        return `<a href="${href}"${rel}>${label}</a>`;
    });

    working = working.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Underscore emphasis only at word boundaries, so snake_case survives.
    working = working.replace(/(?<![\w@])_([^_\n]+)_(?![\w])/g, '<em>$1</em>');

    // Strictness check runs BEFORE code spans are restored. Their contents are
    // literal text, so a span like `docs/legal/**` is not unrendered emphasis —
    // checking after restoration reports the document's own examples as errors.
    // Anything still matching here is a construct this renderer does not handle,
    // and shipping it would put raw markdown on the public page.
    const leftover = working.match(/\]\(|\*\*/);
    if (leftover) {
        throw new Error(
            `build-trust-page: unrendered markdown in ${context}: ${JSON.stringify(text)}`
        );
    }

    working = working.replace(/@@CODE(\d+)@@/g, (_match, index) => {
        return `<code>${escapeHtml(codeSpans[Number(index)])}</code>`;
    });

    return working;
}

// ---------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------

const slugify = (text) =>
    text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');

/** Strip inline markup for use in a plain-text attribute. */
const plain = (text) => text.replace(/[*_`]/g, '');

export function renderMarkdown(markdown) {
    const lines = markdown.split('\n');
    const out = [];
    let i = 0;

    const flushList = (ordered) => {
        const tag = ordered ? 'ol' : 'ul';
        const items = [];
        while (i < lines.length) {
            const line = lines[i];
            const match = ordered ? /^(\d+)\.\s+(.*)$/.exec(line) : /^[-*]\s+(.*)$/.exec(line);
            if (!match) break;
            let content = ordered ? match[2] : match[1];
            i += 1;
            // Continuation lines are indented; join them into the same item.
            while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*]\s/.test(lines[i])) {
                content += ` ${lines[i].trim()}`;
                i += 1;
            }
            items.push(`      <li>${renderInline(content, `list item ${items.length + 1}`)}</li>`);
        }
        out.push(`    <${tag}>`, ...items, `    </${tag}>`);
    };

    while (i < lines.length) {
        const line = lines[i];

        if (line.trim() === '') {
            i += 1;
            continue;
        }

        // Horizontal rule
        if (/^---+$/.test(line.trim())) {
            out.push('    <hr />');
            i += 1;
            continue;
        }

        // HTML comment — passed through untouched (used for editor guidance).
        if (line.trim().startsWith('<!--')) {
            while (i < lines.length && !lines[i].includes('-->')) i += 1;
            i += 1;
            continue;
        }

        // Heading
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading) {
            const level = heading[1].length;
            const id = slugify(plain(heading[2]));
            out.push(
                `    <h${level} id="${id}">${renderInline(
                    heading[2],
                    `heading "${heading[2]}"`
                )}</h${level}>`
            );
            i += 1;
            continue;
        }

        // Fenced code
        if (line.startsWith('```')) {
            const lang = line.slice(3).trim();
            i += 1;
            const body = [];
            while (i < lines.length && !lines[i].startsWith('```')) {
                body.push(lines[i]);
                i += 1;
            }
            if (i >= lines.length) throw new Error('build-trust-page: unterminated code fence');
            i += 1;
            const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
            out.push(`    <pre><code${cls}>${escapeHtml(body.join('\n'))}</code></pre>`);
            continue;
        }

        // Table
        if (line.trim().startsWith('|')) {
            const rows = [];
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                rows.push(lines[i].trim());
                i += 1;
            }
            if (rows.length < 2 || !/^\|[\s:|-]+\|$/.test(rows[1])) {
                throw new Error(
                    `build-trust-page: malformed table near ${JSON.stringify(rows[0])}`
                );
            }
            const cells = (row) =>
                row
                    .slice(1, -1)
                    .split('|')
                    .map((cell) => cell.trim());
            const head = cells(rows[0])
                .map((cell) => `<th>${renderInline(cell, 'table header')}</th>`)
                .join('');
            const body = rows
                .slice(2)
                .map(
                    (row) =>
                        `        <tr>${cells(row)
                            .map((cell) => `<td>${renderInline(cell, 'table cell')}</td>`)
                            .join('')}</tr>`
                )
                .join('\n');
            out.push(
                '    <div class="table-wrap">',
                '      <table>',
                `        <thead><tr>${head}</tr></thead>`,
                '        <tbody>',
                body,
                '        </tbody>',
                '      </table>',
                '    </div>'
            );
            continue;
        }

        // Blockquote
        if (line.startsWith('> ')) {
            const body = [];
            while (i < lines.length && lines[i].startsWith('>')) {
                body.push(lines[i].replace(/^>\s?/, ''));
                i += 1;
            }
            out.push(`    <blockquote>${renderInline(body.join(' '), 'blockquote')}</blockquote>`);
            continue;
        }

        // Lists
        if (/^[-*]\s+/.test(line)) {
            flushList(false);
            continue;
        }
        if (/^\d+\.\s+/.test(line)) {
            flushList(true);
            continue;
        }

        // Paragraph: consume until a blank line or the start of another block.
        const para = [];
        while (
            i < lines.length &&
            lines[i].trim() !== '' &&
            !/^(#{1,6}\s|```|>|---+$|[-*]\s|\d+\.\s)/.test(lines[i]) &&
            !lines[i].trim().startsWith('|')
        ) {
            para.push(lines[i].trim());
            i += 1;
        }
        out.push(`    <p>${renderInline(para.join(' '), 'paragraph')}</p>`);
    }

    return out.join('\n');
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

/**
 * Deliberately self-contained: inline CSS, no JavaScript, no webfonts, no
 * third-party requests. A page whose purpose is "we do not leak your data to
 * anyone" should not load an analytics script or a CDN font to say so, and it
 * must render for someone reading it with JS disabled behind Tor.
 */
export function renderPage(markdown) {
    const body = renderMarkdown(markdown);
    const description =
        "Blackout's public trust commitments: end-to-end encryption that is never paywalled, free self-service data export, and a versioned record of every policy change — each linked to the code that backs it.";

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Trust — Blackout</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${CANONICAL}" />
    <meta property="og:title" content="Trust — Blackout" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${CANONICAL}" />
    <meta name="color-scheme" content="light dark" />
    <link rel="icon" href="/favicon.ico" />
    <style>
      :root {
        --bg: #ffffff;
        --fg: #1a1a1a;
        --muted: #5a5a5a;
        --rule: #e2e2e2;
        --accent: #7b3fe4;
        --code-bg: #f5f4f8;
        --quote-bg: #f8f7fb;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #131316;
          --fg: #ececf0;
          --muted: #a0a0ab;
          --rule: #2c2c33;
          --accent: #b18cf5;
          --code-bg: #1d1d22;
          --quote-bg: #1a1a20;
        }
      }
      * { box-sizing: border-box; }
      html { -webkit-text-size-adjust: 100%; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--fg);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 17px;
        line-height: 1.65;
      }
      main {
        max-width: 46rem;
        margin: 0 auto;
        padding: 3rem 1.25rem 5rem;
      }
      h1 { font-size: 2.4rem; line-height: 1.15; margin: 0 0 1.5rem; letter-spacing: -0.02em; }
      h2 { font-size: 1.6rem; line-height: 1.25; margin: 3rem 0 1rem; letter-spacing: -0.01em; }
      h3 { font-size: 1.15rem; margin: 2rem 0 0.75rem; }
      p { margin: 0 0 1.1rem; }
      a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
      a:hover { text-decoration-thickness: 2px; }
      strong { font-weight: 650; }
      ul, ol { margin: 0 0 1.1rem; padding-left: 1.4rem; }
      li { margin-bottom: 0.5rem; }
      hr { border: 0; border-top: 1px solid var(--rule); margin: 2.5rem 0; }
      code {
        background: var(--code-bg);
        border-radius: 4px;
        padding: 0.12em 0.35em;
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
        font-size: 0.88em;
        word-break: break-word;
      }
      pre {
        background: var(--code-bg);
        border: 1px solid var(--rule);
        border-radius: 8px;
        padding: 0.9rem 1rem;
        overflow-x: auto;
        margin: 0 0 1.1rem;
      }
      pre code { background: none; padding: 0; font-size: 0.85em; }
      blockquote {
        margin: 0 0 1.1rem;
        padding: 0.75rem 1rem;
        background: var(--quote-bg);
        border-left: 3px solid var(--accent);
        border-radius: 0 6px 6px 0;
      }
      /* Wide tables scroll inside their own box so the page never scrolls sideways. */
      .table-wrap { overflow-x: auto; margin: 0 0 1.4rem; }
      table { border-collapse: collapse; width: 100%; font-size: 0.94rem; }
      th, td { text-align: left; padding: 0.55rem 0.7rem; border-bottom: 1px solid var(--rule); vertical-align: top; }
      th { font-weight: 620; white-space: nowrap; }
      footer {
        max-width: 46rem;
        margin: 0 auto;
        padding: 0 1.25rem 4rem;
        color: var(--muted);
        font-size: 0.9rem;
      }
      footer a { color: var(--muted); }
    </style>
  </head>
  <body>
    <main>
${body}
    </main>
    <footer>
      <p>
        This page is generated from
        <a href="${REPO_BLOB}TRUST.md" rel="noopener noreferrer">TRUST.md</a>
        in the Blackout repository, and CI fails if the two disagree. Every claim
        above links to the code behind it.
      </p>
    </footer>
  </body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

/**
 * Both static hosts end their config with a catch-all that rewrites every
 * unmatched path to the SPA's `index.html`. A `/trust` rule placed *after* that
 * catch-all is dead: the page still builds, the file still ships, CI still
 * passes, and visitors get the chat app instead. Nothing else in the pipeline
 * would notice, which is why the ordering is asserted rather than assumed.
 *
 * @returns {string[]} problems, empty when routing is correct
 */
export function checkRouting(nginxConf, netlifyConf, viteConf = '') {
    const problems = [];

    // The client sets `publicDir: false`, so nothing under public/ reaches the
    // build output unless it is listed in the static-copy targets. Omit it and
    // the page generates, the rewrite rules are right, CI is green, and the file
    // is simply not in dist — a failure with no symptom until someone loads the
    // URL. Only checked when a config is supplied, so the routing unit tests can
    // exercise the host rules on their own.
    if (viteConf && !/['"]public\/trust\.html['"]/.test(viteConf)) {
        problems.push(
            'apps/blackout-client/vite.config.js: public/trust.html is not in the ' +
                'static-copy targets, so it will not be in the build output (publicDir is false)'
        );
    }

    // Comments are stripped first. Both files carry a comment above the rule
    // explaining why it exists, and matching the word "/trust" anywhere would
    // find that prose — an earlier version of this check did exactly that and
    // stayed green with the rule deleted.
    const withoutComments = (conf) =>
        conf
            .split('\n')
            .filter((line) => !line.trim().startsWith('#'))
            .join('\n');

    const nginx = withoutComments(nginxConf);
    const netlify = withoutComments(netlifyConf);

    // The LAST trust rule, not the first: there are two (`/trust` and
    // `/trust.html`), and if only one slips past the catch-all the canonical URL
    // is the one that breaks while the check would still see a rule in the right
    // place. Every trust rule has to precede the catch-all.
    const nginxTrustMatches = [...nginx.matchAll(/^\s*rewrite\s+\^\/trust/gm)];
    const nginxTrust = nginxTrustMatches.length
        ? nginxTrustMatches[nginxTrustMatches.length - 1].index
        : -1;
    const nginxCatchAll = nginx.indexOf('rewrite ^(.+)$ /index.html');
    if (nginxTrust === -1) {
        problems.push(`${NGINX_CONF}: no /trust rewrite — the page would not be reachable`);
    } else if (nginxCatchAll !== -1 && nginxTrust > nginxCatchAll) {
        problems.push(
            `${NGINX_CONF}: the /trust rewrite comes after the SPA catch-all, so it never runs`
        );
    }

    const netlifyTrust = netlify.indexOf('from = "/trust"');
    const netlifyCatchAll = netlify.indexOf('from = "/*"');
    if (netlifyTrust === -1) {
        problems.push(`${NETLIFY_CONF}: no /trust redirect — the page would not be reachable`);
    } else if (netlifyCatchAll !== -1 && netlifyTrust > netlifyCatchAll) {
        problems.push(
            `${NETLIFY_CONF}: the /trust redirect comes after the /* catch-all, so it never runs`
        );
    }

    return problems;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
    const check = process.argv.includes('--check');
    const markdown = readFileSync(SOURCE, 'utf8');

    let rendered;
    try {
        rendered = renderPage(markdown);
    } catch (err) {
        console.error(`build-trust-page: FAIL\n\n  ${err.message}\n`);
        console.error(
            'The renderer refuses to guess. Either simplify the markdown in TRUST.md,\n' +
                'or extend tools/ci/build-trust-page.mjs to handle the construct.\n'
        );
        process.exit(1);
    }

    if (check) {
        const routing = checkRouting(
            readFileSync(NGINX_CONF, 'utf8'),
            readFileSync(NETLIFY_CONF, 'utf8'),
            readFileSync(VITE_CONF, 'utf8')
        );
        if (routing.length > 0) {
            console.error('build-trust-page: FAIL — the trust page would not be served.\n');
            for (const problem of routing) console.error(`  ${problem}`);
            console.error(
                '\n  A trust page nobody can reach is worse than none: the repo says it is\n' +
                    '  published and the URL shows the chat app.\n'
            );
            process.exit(1);
        }

        const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : null;
        if (current !== rendered) {
            console.error('build-trust-page: FAIL — the published trust page is out of date.\n');
            console.error(
                `  ${SOURCE} has changed but ${OUTPUT} was not regenerated, so the public\n` +
                    '  page and the repository would state different things.\n\n' +
                    '  Fix: pnpm build:trust-page, then commit the result.\n'
            );
            process.exit(1);
        }
        console.log(`build-trust-page: OK (${OUTPUT} matches ${SOURCE})`);
        return;
    }

    writeFileSync(OUTPUT, rendered);
    // Byte length, not `rendered.length` — the page is full of em dashes, so the
    // character count understates the file size and looked like a copy mismatch.
    console.log(`build-trust-page: wrote ${OUTPUT} (${Buffer.byteLength(rendered)} bytes)`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
    main();
}
