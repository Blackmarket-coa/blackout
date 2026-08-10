import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';

import {
    checkRouting,
    renderInline,
    renderMarkdown,
    renderPage,
    resolveHref,
} from './build-trust-page.mjs';

// --- link rewriting --------------------------------------------------------

test('repo-relative links become GitHub blob URLs', () => {
    // TRUST.md links relative because it is read on GitHub. Served from a web
    // host those 404, which would quietly break every "verify it yourself" link
    // on the page whose entire point is being checkable.
    assert.equal(
        resolveHref('packages/api/src/routes/dataExport.ts'),
        'https://github.com/Blackmarket-coa/blackout/blob/develop/packages/api/src/routes/dataExport.ts'
    );
    assert.equal(
        resolveHref('./SECURITY.md'),
        'https://github.com/Blackmarket-coa/blackout/blob/develop/SECURITY.md'
    );
});

test('absolute URLs and anchors pass through untouched', () => {
    assert.equal(resolveHref('https://example.test/x'), 'https://example.test/x');
    assert.equal(resolveHref('mailto:a@b.test'), 'mailto:a@b.test');
    assert.equal(resolveHref('#section'), '#section');
});

// --- inline rendering ------------------------------------------------------

test('renders bold, emphasis, code and links', () => {
    assert.match(renderInline('**bold**'), /<strong>bold<\/strong>/);
    assert.match(renderInline('_soft_'), /<em>soft<\/em>/);
    assert.match(renderInline('`x`'), /<code>x<\/code>/);
    assert.match(renderInline('[a](https://b.test)'), /<a href="https:\/\/b\.test"/);
});

test('external links get rel="noopener noreferrer"', () => {
    assert.match(renderInline('[a](https://b.test)'), /rel="noopener noreferrer"/);
});

test('snake_case inside code is not turned into emphasis', () => {
    // The regression this protects: `encryption_enabled_by_default_for_room_type`
    // has two underscores and would otherwise render with an italic middle.
    const out = renderInline('`encryption_enabled_by_default_for_room_type`');
    assert.match(out, /<code>encryption_enabled_by_default_for_room_type<\/code>/);
    assert.ok(!out.includes('<em>'), 'no emphasis inside a code span');
});

test('HTML in the source is escaped, not passed through', () => {
    const out = renderInline('a <script>alert(1)</script> b');
    assert.ok(!out.includes('<script'), 'markdown content cannot inject markup');
    assert.match(out, /&lt;script&gt;/);
});

test('a glob inside a code span is not mistaken for unrendered bold', () => {
    // `docs/legal/**` is literal text. An earlier version of this renderer ran
    // its strictness check after restoring code spans and rejected the page's
    // own example.
    const out = renderInline('owned in `docs/legal/**` so changes need review');
    assert.match(out, /<code>docs\/legal\/\*\*<\/code>/);
});

// --- strictness ------------------------------------------------------------

test('throws rather than emitting unrendered markdown', () => {
    // The safety property that makes a hand-written renderer acceptable: it
    // fails the build instead of shipping a mangled sentence to the public page.
    assert.throws(() => renderInline('a [link](with space) b'), /unrendered markdown/);
});

test('throws on a malformed table', () => {
    assert.throws(() => renderMarkdown('| a | b |\n| oops |\n'), /malformed table/);
});

test('throws on an unterminated code fence', () => {
    assert.throws(() => renderMarkdown('```bash\nnever closed\n'), /unterminated code fence/);
});

// --- block rendering -------------------------------------------------------

test('headings carry stable slug ids', () => {
    assert.match(
        renderMarkdown('## 1. Encryption, never behind a paywall'),
        /<h2 id="1-encryption-never-behind-a-paywall">/
    );
});

test('tables render with a scroll wrapper so the page never scrolls sideways', () => {
    const out = renderMarkdown('| Claim | Check |\n| --- | --- |\n| a | b |\n');
    assert.match(out, /<div class="table-wrap">/);
    assert.match(out, /<th>Claim<\/th>/);
    assert.match(out, /<td>a<\/td>/);
});

test('list items keep their inline markup and absorb continuation lines', () => {
    const out = renderMarkdown('-   **Bold** start\n    continued here\n');
    assert.match(out, /<li><strong>Bold<\/strong> start continued here<\/li>/);
});

test('fenced code is escaped and keeps its language class', () => {
    const out = renderMarkdown('```bash\ncurl -H "A: b" x\n```\n');
    assert.match(out, /<pre><code class="language-bash">/);
    assert.match(out, /&quot;A: b&quot;/);
});

// --- page shell ------------------------------------------------------------

test('the page ships no scripts and no third-party requests', () => {
    // A page that says "we do not leak your data" must not load an analytics
    // script or a CDN font in order to say it, and has to render with JS off.
    const page = renderPage('# Trust\n\nSome text with a [link](SECURITY.md).\n');
    assert.ok(!/<script/i.test(page), 'no script tags');
    assert.ok(
        !/(src|href)="https?:\/\/(?!github\.com|theblackout\.app)/.test(page),
        'no external asset hosts'
    );
    assert.match(page, /<!doctype html>/);
    assert.match(page, /<meta name="viewport"/);
    assert.match(page, /prefers-color-scheme: dark/);
});

// --- routing ---------------------------------------------------------------

test('routing check accepts correctly ordered config', () => {
    const nginx = 'rewrite ^/trust/?$ /trust.html break;\nrewrite ^(.+)$ /index.html break;';
    const netlify = '[[redirects]]\nfrom = "/trust"\n\n[[redirects]]\nfrom = "/*"\n';
    assert.deepEqual(checkRouting(nginx, netlify), []);
});

test('routing check catches a /trust rule placed after the SPA catch-all', () => {
    // The silent failure mode: the page builds, ships, and CI is green, but the
    // catch-all swallows /trust and visitors get the chat app instead.
    const nginx = 'rewrite ^(.+)$ /index.html break;\nrewrite ^/trust/?$ /trust.html break;';
    const netlify = '[[redirects]]\nfrom = "/trust"\n\n[[redirects]]\nfrom = "/*"\n';
    const problems = checkRouting(nginx, netlify);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /never runs/);
});

test('routing check catches one trust rule slipping past the catch-all', () => {
    // Two nginx rules exist (/trust and /trust.html). Checking only the first
    // match reports success while the canonical /trust URL is the broken one.
    const nginx = [
        'rewrite ^/trust\\.html$ /trust.html break;',
        'rewrite ^(.+)$ /index.html break;',
        'rewrite ^/trust/?$ /trust.html break;',
    ].join('\n');
    const netlify = '[[redirects]]\nfrom = "/trust"\n\n[[redirects]]\nfrom = "/*"\n';
    const problems = checkRouting(nginx, netlify);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /never runs/);
});

test('a comment mentioning /trust does not satisfy the routing check', () => {
    // The shipped configs carry an explanatory comment above the rule. Matching
    // it as though it were the rule kept the check green with the rule deleted.
    const nginx = '# Public trust page at /trust\nrewrite ^(.+)$ /index.html break;';
    const netlify = '# trust page\n# from = "/trust"\n[[redirects]]\nfrom = "/*"\n';
    const problems = checkRouting(nginx, netlify);
    assert.equal(problems.length, 2, 'both hosts reported as unreachable');
});

test('routing check catches a missing rule on either host', () => {
    const nginx = 'rewrite ^(.+)$ /index.html break;';
    const netlify = '[[redirects]]\nfrom = "/*"\n';
    const problems = checkRouting(nginx, netlify);
    assert.equal(problems.length, 2);
    assert.ok(problems.every((p) => /not be reachable/.test(p)));
});

test('the real shipped configs route /trust before their catch-alls', () => {
    assert.deepEqual(
        checkRouting(
            readFileSync('apps/blackout-client/docker-nginx.conf', 'utf8'),
            readFileSync('apps/blackout-client/netlify.toml', 'utf8')
        ),
        []
    );
});

test('routing check catches the page being left out of the build', () => {
    // `publicDir: false` means an unlisted file never reaches dist. Everything
    // else can be correct — generated page, both rewrite rules — and the URL
    // still 404s, with nothing else in the pipeline noticing.
    const nginx = 'rewrite ^/trust/?$ /trust.html break;\nrewrite ^(.+)$ /index.html break;';
    const netlify = '[[redirects]]\nfrom = "/trust"\n\n[[redirects]]\nfrom = "/*"\n';
    const problems = checkRouting(nginx, netlify, "targets: [{ src: 'config.json' }]");
    assert.equal(problems.length, 1);
    assert.match(problems[0], /not be in the build output/);
});

test('the real vite config ships the trust page', () => {
    assert.deepEqual(
        checkRouting(
            readFileSync('apps/blackout-client/docker-nginx.conf', 'utf8'),
            readFileSync('apps/blackout-client/netlify.toml', 'utf8'),
            readFileSync('apps/blackout-client/vite.config.js', 'utf8')
        ),
        []
    );
});
