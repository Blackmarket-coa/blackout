import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    CLIENT_CONF,
    COMPLETE_KEY,
    COMPLETE_MUST_MATCH,
    COMPLETE_MUST_NOT_MATCH,
    STACKS,
    UPSTREAM_KEY,
    UPSTREAM_MUST_MATCH,
    UPSTREAM_MUST_NOT_MATCH,
    checkPinnedKeys,
    checkStack,
    loadStack,
    mapKeyRegex,
    parse,
    runAll,
    tokenize,
    withoutFrameAncestors,
} from './check-embed-proxy-framing.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(repoRoot, 'tools/ci/check-embed-proxy-framing.mjs');

/** Replace the first occurrence, failing loudly if the fixture text is gone. */
const replaceOnce = (text, from, to) => {
    const at = text.indexOf(from);
    assert.notEqual(at, -1, `fixture text not found:\n${from}`);
    return text.slice(0, at) + to + text.slice(at + from.length);
};

/** The text of a block starting at `head` (through its closing brace). */
const blockText = (text, head) => {
    const start = text.indexOf(head);
    assert.notEqual(start, -1, `block not found: ${head}`);
    let depth = 0;
    for (let i = text.indexOf('{', start); i < text.length; i += 1) {
        if (text[i] === '{') depth += 1;
        else if (text[i] === '}') {
            depth -= 1;
            if (depth === 0) return text.slice(start, i + 1);
        }
    }
    throw new Error(`unbalanced block: ${head}`);
};

const ROOT_LOCATION = '    location / {\n        proxy_pass http://blackout_web;\n    }';
const PANEL_ECHO =
    '        add_header Content-Security-Policy $black_mask_panel_frame_ancestors always;';
const PANEL_NOSNIFF = '        add_header X-Content-Type-Options "nosniff" always;';
const UPSTREAM_LINE =
    '"~^frame-ancestors (\'none\'|[a-z][a-z0-9+.-]*://[a-z0-9.-]+(:[0-9]+)?( [a-z][a-z0-9+.-]*://[a-z0-9.-]+(:[0-9]+)?)*)$" 1;';

test('the committed proxies pass', () => {
    assert.deepEqual(runAll(repoRoot), []);
});

test('the CLI passes on the repository', () => {
    const r = spawnSync(process.execPath, [script], { encoding: 'utf8', cwd: os.tmpdir() });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /check-embed-proxy-framing: OK/);
});

test('the CLI fails, naming the file, when a proxy loses a panel location', () => {
    // A copy of just the files the guard reads, with one panel location removed.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-proxy-guard-'));
    try {
        const files = [
            'tools/ci/check-embed-proxy-framing.mjs',
            CLIENT_CONF,
            ...STACKS.flatMap((s) => [
                s.site,
                s.main,
                `${s.snippets}/security-headers.conf`,
                `${s.snippets}/hsts.conf`,
                `${s.snippets}/proxy-common.conf`,
            ]),
        ];
        for (const rel of files) {
            fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
            fs.copyFileSync(path.join(repoRoot, rel), path.join(dir, rel));
        }
        const site = path.join(dir, STACKS[0].site);
        const text = fs.readFileSync(site, 'utf8');
        fs.writeFileSync(site, replaceOnce(text, blockText(text, '    location = /embed {'), ''));
        const r = spawnSync(
            process.execPath,
            [path.join(dir, 'tools/ci/check-embed-proxy-framing.mjs')],
            {
                encoding: 'utf8',
            }
        );
        assert.equal(r.status, 1, r.stdout);
        assert.match(r.stderr, /FAIL/);
        assert.match(
            r.stderr,
            new RegExp(`${STACKS[0].site.replaceAll('.', '\\.')}.*location = /embed`)
        );
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

for (const stack of STACKS) {
    const base = loadStack(repoRoot, stack);
    const withField = (field, fn) => ({ ...base, [field]: fn(base[field]) });
    const site = (fn) => withField('site', fn);
    const failuresOf = (input) => checkStack(input).map((f) => f.message);
    const expectFailure = (input, pattern) => {
        const found = failuresOf(input);
        assert.ok(
            found.some((m) => pattern.test(m)),
            `expected a failure matching ${pattern}, got:\n${found.join('\n') || '(none)'}`
        );
    };

    test(`${stack.name}: passes as committed`, () => {
        assert.deepEqual(checkStack(base), []);
    });

    // --- the two panel locations and their raw-URI rule ---------------------

    test(`${stack.name}: fails when a panel location is removed`, () => {
        expectFailure(
            site((t) => replaceOnce(t, blockText(t, '    location = /embed {'), '')),
            /exactly one `location = \/embed`/
        );
        expectFailure(
            site((t) => replaceOnce(t, blockText(t, '    location ^~ /embed/ {'), '')),
            /exactly one `location \^~ \/embed\/`/
        );
    });

    test(`${stack.name}: fails when the prefix location loses ^~`, () => {
        expectFailure(
            site((t) => replaceOnce(t, 'location ^~ /embed/ {', 'location /embed/ {')),
            /exactly one `location \^~ \/embed\/`/
        );
    });

    test(`${stack.name}: fails when the raw-URI rule is loosened, dropped or reads the normalised URI`, () => {
        expectFailure(
            site((t) => replaceOnce(t, '"~^/embed/" 1;', '"~^/embed" 1;')),
            /raw-URI rule/
        );
        expectFailure(
            site((t) => replaceOnce(t, '    "~^/embed(\\?|$)" 1;\n', '')),
            /raw-URI rule/
        );
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    'map $request_uri $black_mask_panel_uri',
                    'map $uri $black_mask_panel_uri'
                )
            ),
            /must read \$request_uri/
        );
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    'map $request_uri $black_mask_panel_uri {\n    default 0;',
                    'map $request_uri $black_mask_panel_uri {\n    default 1;'
                )
            ),
            /raw-URI rule/
        );
    });

    test(`${stack.name}: fails when the client image's raw-URI rule changes without the proxy`, () => {
        expectFailure(
            withField('client', (t) =>
                replaceOnce(t, 'if ($request_uri !~ "^/embed/")', 'if ($request_uri !~ "^/embed")')
            ),
            /raw-URI rule/
        );
        expectFailure(
            withField('client', (t) =>
                replaceOnce(t, 'location ^~ /embed/ {', 'location ^~ /panel/ {')
            ),
            /client image no longer has/
        );
    });

    // --- nothing else gets the relaxed framing ------------------------------

    test(`${stack.name}: fails when location / gets the panel's framing variables`, () => {
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    ROOT_LOCATION,
                    '    location / {\n        proxy_pass http://blackout_web;\n        add_header X-Frame-Options $black_mask_panel_x_frame_options always;\n        add_header Content-Security-Policy $black_mask_panel_csp always;\n    }'
                )
            ),
            /mentions a black_mask_panel_ name/
        );
    });

    test(`${stack.name}: fails when a web-host location sets headers without restoring security-headers.conf`, () => {
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    ROOT_LOCATION,
                    '    location / {\n        proxy_pass http://blackout_web;\n        add_header Cache-Control "no-store";\n    }'
                )
            ),
            /without including .*security-headers\.conf/
        );
    });

    test(`${stack.name}: fails when a web-host location includes only hsts.conf, which drops the inherited set`, () => {
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    ROOT_LOCATION,
                    '    location / {\n        proxy_pass http://blackout_web;\n        include /etc/nginx/snippets/hsts.conf;\n    }'
                )
            ),
            /location \/ includes .*hsts\.conf .*without including .*security-headers\.conf/
        );
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    ROOT_LOCATION,
                    '    location / {\n        proxy_pass http://blackout_web;\n        if ($request_method = POST) {\n            include /etc/nginx/snippets/hsts.conf;\n        }\n    }'
                )
            ),
            /if .*includes .*hsts\.conf .*without including .*security-headers\.conf/
        );
    });

    test(`${stack.name}: fails when another location sets its own frame-ancestors`, () => {
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    ROOT_LOCATION,
                    ROOT_LOCATION.replace('location / {', 'location /embed-preview/ {').replace(
                        '    }',
                        '        include /etc/nginx/snippets/security-headers.conf;\n        add_header Content-Security-Policy "frame-ancestors *" always;\n    }'
                    ) +
                        '\n\n' +
                        ROOT_LOCATION
                )
            ),
            /sets its own Content-Security-Policy/
        );
    });

    test(`${stack.name}: fails when another server block uses the panel's variables`, () => {
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    '    location / {\n        return 404;\n    }',
                    '    location / {\n        add_header X-Frame-Options $black_mask_panel_x_frame_options;\n        return 404;\n    }'
                )
            ),
            /mentions a black_mask_panel_ name/
        );
        expectFailure(
            withField('securityHeaders', (t) =>
                replaceOnce(
                    t,
                    'add_header X-Frame-Options "DENY" always;',
                    'add_header X-Frame-Options $black_mask_panel_x_frame_options always;'
                )
            ),
            /X-Frame-Options "DENY"/
        );
    });

    // --- the relaxed CSP and the panel's other headers ----------------------

    test(`${stack.name}: fails when the relaxed CSP drifts from security-headers.conf`, () => {
        // Drift inside the relaxed value only.
        expectFailure(
            site((t) => {
                const relaxedLine = t
                    .split('\n')
                    .find((l) => l.trimStart().startsWith('111 "default-src'));
                return replaceOnce(
                    t,
                    relaxedLine,
                    relaxedLine.replace("img-src 'self' data: blob:", 'img-src *')
                );
            }),
            /relaxed value is that CSP without frame-ancestors/
        );
        // security-headers.conf changes and the maps do not follow.
        expectFailure(
            withField('securityHeaders', (t) =>
                replaceOnce(
                    t,
                    'wss://matrix.theblackout.app;',
                    'wss://matrix.theblackout.app https://cdn.example;'
                )
            ),
            /relaxed value is that CSP without frame-ancestors/
        );
        // The "relaxed" value still carrying frame-ancestors is drift too.
        expectFailure(
            site((t) => {
                const relaxedLine = t
                    .split('\n')
                    .find((l) => l.trimStart().startsWith('111 "default-src'));
                return replaceOnce(
                    t,
                    relaxedLine,
                    relaxedLine.replace("base-uri 'self'", "frame-ancestors *; base-uri 'self'")
                );
            }),
            /relaxed value is that CSP without frame-ancestors/
        );
    });

    test(`${stack.name}: fails when the panel's other headers drift`, () => {
        expectFailure(
            site((t) =>
                replaceOnce(t, PANEL_NOSNIFF, PANEL_NOSNIFF.replace('"nosniff"', '"nosniff, x"'))
            ),
            /headers must be exactly/
        );
        expectFailure(
            site((t) => replaceOnce(t, PANEL_NOSNIFF, PANEL_NOSNIFF.replace(' always;', ';'))),
            /headers must be exactly/
        );
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    '        include /etc/nginx/snippets/hsts.conf;\n        add_header X-Frame-Options',
                    '        add_header X-Frame-Options'
                )
            ),
            /headers must be exactly/
        );
        expectFailure(
            withField('securityHeaders', (t) => replaceOnce(t, 'usb=()', 'usb=(), serial=()')),
            /headers must be exactly/
        );
        expectFailure(
            withField('hsts', (t) => replaceOnce(t, 'max-age=63072000', 'max-age=300')),
            /Strict-Transport-Security line of security-headers\.conf/
        );
    });

    test(`${stack.name}: fails when a panel location proxies differently from location /`, () => {
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    '    location = /embed {\n        proxy_pass http://blackout_web;',
                    '    location = /embed {\n        proxy_pass http://blackout_web;\n        proxy_set_header Host $host;'
                )
            ),
            /must proxy exactly as `location \/`/
        );
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    '    location ^~ /embed/ {\n        proxy_pass http://blackout_web;',
                    '    location ^~ /embed/ {\n        proxy_pass http://blackout_api;'
                )
            ),
            /must proxy exactly as `location \/`/
        );
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    '    location = /embed {\n        proxy_pass http://blackout_web;',
                    '    location = /embed {\n        proxy_pass http://blackout_web;\n        if ($http_x_test) { return 404; }'
                )
            ),
            /unexpected `if`/
        );
    });

    // --- the fail-safe ------------------------------------------------------

    test(`${stack.name}: fails when a fail-safe default is removed or emptied`, () => {
        expectFailure(
            site((t) => replaceOnce(t, '    default "DENY";\n', '')),
            /X-Frame-Options stays/
        );
        expectFailure(
            site((t) => replaceOnce(t, 'default "DENY";', 'default "";')),
            /X-Frame-Options stays/
        );
        expectFailure(
            site((t) => {
                const defaultLine = t
                    .split('\n')
                    .find((l) => l.trimStart().startsWith('default "default-src'));
                return replaceOnce(t, `${defaultLine}\n`, '');
            }),
            /the default is security-headers\.conf's CSP/
        );
        expectFailure(
            site((t) => {
                const defaultLine = t
                    .split('\n')
                    .find((l) => l.trimStart().startsWith('default "default-src'));
                return replaceOnce(
                    t,
                    defaultLine,
                    defaultLine.replace("frame-ancestors 'none'; ", '')
                );
            }),
            /the default is security-headers\.conf's CSP/
        );
    });

    test(`${stack.name}: fails when the relax condition stops requiring all three tests`, () => {
        expectFailure(
            site((t) => replaceOnce(t, '    111 "";', '    111 "";\n    101 "";')),
            /X-Frame-Options stays/
        );
        // Relaxing on an incomplete upstream header block (F1 of the review).
        expectFailure(
            site((t) => replaceOnce(t, '    111 "";', '    111 "";\n    110 "";')),
            /X-Frame-Options stays/
        );
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    'map $black_mask_panel_uri$black_mask_panel_upstream_frames$black_mask_panel_upstream_complete $black_mask_panel_x_frame_options',
                    'map $black_mask_panel_upstream_frames $black_mask_panel_x_frame_options'
                )
            ),
            /must read \$black_mask_panel_uri\$black_mask_panel_upstream_frames\$black_mask_panel_upstream_complete/
        );
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    'map $black_mask_panel_uri$black_mask_panel_upstream_frames$black_mask_panel_upstream_complete $black_mask_panel_csp',
                    'map $black_mask_panel_uri$black_mask_panel_upstream_frames $black_mask_panel_csp'
                )
            ),
            /must read \$black_mask_panel_uri\$black_mask_panel_upstream_frames\$black_mask_panel_upstream_complete/
        );
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    'map $upstream_http_content_security_policy $black_mask_panel_upstream_frames {\n    default 0;',
                    'map $upstream_http_content_security_policy $black_mask_panel_upstream_frames {\n    default 1;'
                )
            ),
            /map \$black_mask_panel_upstream_frames must be exactly/
        );
    });

    test(`${stack.name}: fails when the completeness test is removed or loosened`, () => {
        const COMPLETE_MAP =
            'map $upstream_header_time $black_mask_panel_upstream_complete {\n    default 0;\n    "~(^| )[0-9]+\\.[0-9]+$" 1;\n}\n\n';
        expectFailure(
            site((t) => replaceOnce(t, COMPLETE_MAP, '')),
            /map \$black_mask_panel_upstream_complete is missing/
        );
        expectFailure(
            site((t) =>
                replaceOnce(t, COMPLETE_MAP, COMPLETE_MAP.replace('default 0;', 'default 1;'))
            ),
            /whole header block/
        );
        // "-" (an incomplete attempt) must not count as complete.
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    COMPLETE_MAP,
                    COMPLETE_MAP.replace('"~(^| )[0-9]+\\.[0-9]+$"', '"~."')
                )
            ),
            /whole header block/
        );
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    COMPLETE_MAP,
                    COMPLETE_MAP.replace('$upstream_header_time', '$upstream_response_time')
                )
            ),
            /must read \$upstream_header_time/
        );
    });

    test(`${stack.name}: fails when the upstream test is changed in any way (pinned byte for byte)`, () => {
        const pinned = /map \$black_mask_panel_upstream_frames must be exactly/;
        const loosenings = [
            // Any mention of frame-ancestors.
            (t) => replaceOnce(t, UPSTREAM_LINE, '"~frame-ancestors" 1;'),
            // The token class of this change's first draft, which accepted 'self'.
            (t) => replaceOnce(t, UPSTREAM_LINE, `"~^frame-ancestors( [a-z0-9:/.'-]+)+$" 1;`),
            (t) => replaceOnce(t, "frame-ancestors ('none'|", "frame-ancestors ('none'|'self'|"),
            (t) => replaceOnce(t, '://[a-z0-9.-]+(:[0-9]+)?( ', '://[a-z0-9.*-]+(:[0-9]+)?( '),
            (t) => replaceOnce(t, UPSTREAM_LINE, `"~^frame-ancestors( [^;]+)+$" 1;`),
            // Review bypasses: a 'self' tail (claims D4), case-insensitive (~*),
            // a host class with "_", and a PCRE-only \Q...\E alternative that a
            // JS evaluation of the regex reads differently (security F2 d).
            (t) => replaceOnce(t, '(:[0-9]+)?)*)$" 1;', `(:[0-9]+)?| 'self')*)$" 1;`),
            (t) => replaceOnce(t, '"~^frame-ancestors (', '"~*^frame-ancestors ('),
            (t) => replaceOnce(t, '://[a-z0-9.-]+(:[0-9]+)?)*)', '://[a-z0-9._-]+(:[0-9]+)?)*)'),
            (t) => replaceOnce(t, ')*)$" 1;', `)*)$|^\\Qframe-ancestors 'self'\\E$" 1;`),
        ];
        for (const loosen of loosenings) expectFailure(site(loosen), pinned);
    });

    test(`${stack.name}: fails when the repeated upstream frame-ancestors is dropped or always sent`, () => {
        expectFailure(
            site((t) => {
                const echoLine = t.split('\n').find((l) => l.startsWith(PANEL_ECHO));
                return replaceOnce(t, `${echoLine}\n`, '');
            }),
            /headers must be exactly/
        );
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    'map $black_mask_panel_uri$black_mask_panel_upstream_frames$black_mask_panel_upstream_complete $black_mask_panel_frame_ancestors {\n    default "";',
                    'map $black_mask_panel_uri$black_mask_panel_upstream_frames$black_mask_panel_upstream_complete $black_mask_panel_frame_ancestors {\n    default $upstream_http_content_security_policy;'
                )
            ),
            /repeated only when all three tests pass/
        );
    });

    // --- review bypasses (security F2): names are case-insensitive ---------

    test(`${stack.name}: fails on a second map for a panel variable, in another case`, () => {
        // (a) A later upper-case map replaces the upstream test with "always 1".
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    'map $upstream_header_time',
                    'map $upstream_http_content_security_policy $BLACK_MASK_PANEL_UPSTREAM_FRAMES {\n    default 1;\n}\n\nmap $upstream_header_time'
                )
            ),
            /2 maps define \$black_mask_panel_upstream_frames/
        );
        // (b) An earlier one for the raw-URI flag: still two definitions.
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    'map $request_uri $black_mask_panel_uri {',
                    'map $request_uri $BLACK_MASK_PANEL_URI {\n    default 1;\n}\n\nmap $request_uri $black_mask_panel_uri {'
                )
            ),
            /2 maps define \$black_mask_panel_uri/
        );
    });

    test(`${stack.name}: fails when set, geo or a regex capture writes a panel variable`, () => {
        const serverInclude = '    include /etc/nginx/snippets/security-headers.conf;\n';
        expectFailure(
            site((t) =>
                replaceOnce(t, serverInclude, `${serverInclude}    set $BLACK_MASK_PANEL_URI 1;\n`)
            ),
            /set sets \$BLACK_MASK_PANEL_URI/
        );
        expectFailure(
            site((t) =>
                replaceOnce(t, serverInclude, `${serverInclude}    set $black_mask_panel_uri 1;\n`)
            ),
            /set sets \$black_mask_panel_uri/
        );
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    'map $request_uri $black_mask_panel_uri {',
                    'geo $Black_Mask_Panel_Uri {\n    default 1;\n}\n\nmap $request_uri $black_mask_panel_uri {'
                )
            ),
            /geo sets \$Black_Mask_Panel_Uri/
        );
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    ROOT_LOCATION,
                    '    location ~ ^/(?<black_mask_panel_uri>embed)x/ {\n        proxy_pass http://blackout_web;\n    }\n\n' +
                        ROOT_LOCATION
                )
            ),
            /location mentions a black_mask_panel_ name/
        );
    });

    test(`${stack.name}: fails on a panel variable in another case or as \${...}`, () => {
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    '    location / {\n        return 404;\n    }',
                    '    location / {\n        add_header X-Frame-Options ${black_mask_panel_x_frame_options};\n        return 404;\n    }'
                )
            ),
            /add_header mentions a black_mask_panel_ name/
        );
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    '    location / {\n        return 404;\n    }',
                    '    location / {\n        add_header X-Frame-Options $BLACK_MASK_PANEL_X_FRAME_OPTIONS;\n        return 404;\n    }'
                )
            ),
            /add_header mentions a black_mask_panel_ name/
        );
        expectFailure(
            {
                ...base,
                others: base.others.map((o, i) =>
                    i === 0
                        ? {
                              ...o,
                              text: replaceOnce(
                                  o.text,
                                  '    access_log /var/log/nginx/access.log blackout_main;',
                                  "    log_format panel '${Black_Mask_Panel_Uri}';\n    access_log /var/log/nginx/access.log blackout_main;"
                              ),
                          }
                        : o
                ),
            },
            /log_format mentions a black_mask_panel_ name/
        );
    });

    test(`${stack.name}: fails on an include the guard cannot see into`, () => {
        // (c) The panel's headers moved into a new snippet included by location /.
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    ROOT_LOCATION,
                    '    location / {\n        proxy_pass http://blackout_web;\n        include /etc/nginx/snippets/panel-headers.conf;\n    }'
                )
            ),
            /include \/etc\/nginx\/snippets\/panel-headers\.conf: this guard cannot see into that file/
        );
        expectFailure(
            site((t) =>
                replaceOnce(
                    t,
                    'map $request_uri $black_mask_panel_uri {',
                    'include /etc/nginx/conf.d/*.conf;\n\nmap $request_uri $black_mask_panel_uri {'
                )
            ),
            /this guard cannot see into that file/
        );
        expectFailure(
            {
                ...base,
                others: base.others.map((o, i) =>
                    i === 0
                        ? {
                              ...o,
                              text: replaceOnce(
                                  o.text,
                                  '    include /etc/nginx/sites-enabled/*.conf;',
                                  '    include /etc/nginx/conf.d/*.conf;\n    include /etc/nginx/sites-enabled/*.conf;'
                              ),
                          }
                        : o
                ),
            },
            /include \/etc\/nginx\/conf\.d\/\*\.conf: this guard cannot see into that file/
        );
        expectFailure(
            withField('securityHeaders', (t) => `${t}include /etc/nginx/snippets/more.conf;\n`),
            /this file may not include anything/
        );
    });

    test(`${stack.name}: fails when security-headers.conf stops denying framing`, () => {
        expectFailure(
            withField('securityHeaders', (t) => replaceOnce(t, "frame-ancestors 'none'; ", '')),
            /exactly one frame-ancestors directive/
        );
    });

    test(`${stack.name}: reports a parse error instead of passing`, () => {
        expectFailure(
            site((t) => replaceOnce(t, ROOT_LOCATION, ROOT_LOCATION.slice(0, -1))),
            /cannot parse/
        );
    });
}

// --- helpers ----------------------------------------------------------------

test('tokenize follows nginx quoting, escapes, comments and ${var}', () => {
    const words = tokenize(`a "b c" 'd"e' f\\"g h#i \${x}y # comment ;\n{ }`)
        .filter((t) => t.type === 'word')
        .map((t) => t.value);
    assert.deepEqual(words, ['a', 'b c', 'd"e', 'f"g', 'h#i', '${x}y']);
    assert.equal(tokenize('"\\t"')[0].value, '\t');
    assert.equal(tokenize('"\\?"')[0].value, '\\?');
});

test('parse builds nested blocks and map entries, and rejects unbalanced input', () => {
    const tree = parse(
        'map $a $b {\n default 0;\n "~^/x(\\?|$)" 1;\n}\nserver { location / { return 404; } }'
    );
    assert.equal(tree[0].name, 'map');
    assert.deepEqual(
        tree[0].block.map((e) => [e.name, e.args]),
        [
            ['default', ['0']],
            ['~^/x(\\?|$)', ['1']],
        ]
    );
    assert.equal(tree[1].block[0].block[0].name, 'return');
    assert.throws(() => parse('server {'), /missing '\}'/);
    assert.throws(() => parse('server { }}'), /unexpected '\}'/);
    assert.throws(() => parse('listen 80'), /missing ';'/);
});

test('withoutFrameAncestors removes only that directive', () => {
    assert.equal(
        withoutFrameAncestors("default-src 'self'; frame-ancestors 'none'; base-uri 'self'"),
        "default-src 'self'; base-uri 'self'"
    );
});

test('the committed upstream test accepts every form the client image writes and nothing else listed', () => {
    for (const stack of STACKS) {
        const key = loadStack(repoRoot, stack)
            .site.split('\n')
            .find((l) => l.includes('"~^frame-ancestors'))
            .trim()
            .split('" ')[0]
            .slice(1);
        const re = mapKeyRegex(key);
        for (const s of UPSTREAM_MUST_MATCH) assert.ok(re.test(s), `${stack.name} rejects ${s}`);
        for (const s of UPSTREAM_MUST_NOT_MATCH) {
            assert.ok(
                !re.test(Buffer.from(s, 'utf8').toString('latin1')),
                `${stack.name} accepts ${JSON.stringify(s)}`
            );
        }
    }
});

test('the pinned regexes pass their own samples, and loosened ones do not', () => {
    assert.deepEqual(checkPinnedKeys(), []);
    const failing = (keys, pattern) => {
        const found = checkPinnedKeys(keys).map((f) => f.message);
        assert.ok(
            found.some((m) => pattern.test(m)),
            `expected ${pattern}, got:\n${found.join('\n') || '(none)'}`
        );
    };
    failing(
        { upstreamKey: UPSTREAM_KEY.replace('(:[0-9]+)?)*)$', "(:[0-9]+)?| 'self')*)$") },
        /accepts "frame-ancestors https:\/\/a\.example 'self'"/
    );
    failing(
        { upstreamKey: UPSTREAM_KEY.replace('(:[0-9]+)?)*)$', '(:[0-9]+)?| \\*)*)$') },
        /accepts "frame-ancestors https:\/\/a\.example \*"/
    );
    failing({ upstreamKey: `~*${UPSTREAM_KEY.slice(1)}` }, /must be a case-sensitive regex/);
    failing(
        { upstreamKey: `${UPSTREAM_KEY}|^\\Qframe-ancestors 'self'\\E$` },
        /syntax JS and PCRE may read differently/
    );
    failing({ completeKey: '~.' }, /COMPLETE_KEY accepts "-"/);
    failing({ completeKey: '~[0-9]' }, /COMPLETE_KEY accepts "0\.001, -"/);
    assert.ok(COMPLETE_MUST_MATCH.length && COMPLETE_MUST_NOT_MATCH.length);
    assert.ok(mapKeyRegex(COMPLETE_KEY).test('-, 0.001'));
});
