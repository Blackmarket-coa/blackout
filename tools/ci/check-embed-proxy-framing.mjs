#!/usr/bin/env node
/**
 * Black Mask chat panel: framing guard for the two front proxies.
 *
 * The web client image (apps/blackout-client) decides whether the chat panel
 * at /embed may be framed, from BLACK_MASK_FRAME_ANCESTORS. The front proxies
 * in infra/nginx and infra/single-server-baseline add their own
 * X-Frame-Options: DENY and a CSP ending in frame-ancestors 'none'
 * (snippets/security-headers.conf) to every response of the server block for
 * theblackout.app and chat.theblackout.app. Browsers enforce every CSP a
 * response carries, so on the two panel locations each proxy leaves out its
 * own framing headers, but only when the raw request URI is the panel's and
 * the client container's response carries a frame-ancestors list in the form
 * the image writes, in a header block nginx read completely. Otherwise the
 * proxy sends the security-headers.conf set.
 *
 * Nothing else checks that arrangement, and most ways it can break fail open.
 * Per proxy, this guard reads the site file, nginx.conf, security-headers.conf,
 * hsts.conf and proxy-common.conf, plus the client image's docker-nginx.conf.
 * It fails when, in either proxy:
 *   - a panel location (`= /embed`, `^~ /embed/`) is missing, or proxies
 *     differently from `location /`;
 *   - the raw-URI map is no longer the client image's two $request_uri tests;
 *   - any of the six panel maps differs from its pinned form: sources, defaults,
 *     the relax key 111, the upstream CSP test and the header-completeness test
 *     (both regexes byte for byte);
 *   - the relaxed CSP differs from security-headers.conf in anything except
 *     the frame-ancestors directive, or the panel's other headers differ from
 *     security-headers.conf / hsts.conf;
 *   - a black_mask_panel_ name appears anywhere else in the proxy's five files,
 *     in any case and in any form ($x, ${x}, a regex capture name), including a
 *     second map, set or geo for one of the panel's variables (nginx variable
 *     names are case-insensitive, a later map replaces an earlier one, and a
 *     set replaces a map's value);
 *   - one of those five files includes a file other than the known ones (site
 *     file: security-headers.conf and hsts.conf; nginx.conf: mime.types,
 *     proxy-common.conf and sites-enabled/*.conf; the snippets: none);
 *   - a location in the web host's server block sets add_header without
 *     restoring security-headers.conf, or sets its own X-Frame-Options or CSP.
 *
 * It does not run nginx, and it cannot see what a host adds outside the
 * repository: other files in sites-enabled/ or conf.d/, its mime.types, or
 * anything in front of the proxy.
 *
 * See docs/black-mask-chat-panel-and-account-link.md (step 2) and
 * docs/security/framing-headers-2026-10-09.md.
 *
 * Run: pnpm guard:embed-proxy-framing
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const STACKS = [
    {
        name: 'infra/nginx',
        site: 'infra/nginx/sites-available/theblackout.app.conf',
        snippets: 'infra/nginx/snippets',
        main: 'infra/nginx/nginx.conf',
    },
    {
        name: 'infra/single-server-baseline',
        site: 'infra/single-server-baseline/nginx/sites-available/theblackout.app.conf',
        snippets: 'infra/single-server-baseline/nginx/snippets',
        main: 'infra/single-server-baseline/nginx/nginx.conf',
    },
];

export const CLIENT_CONF = 'apps/blackout-client/docker-nginx.conf';

/*
 * nginx variable names are case-insensitive, `$x` and `${x}` name the same
 * variable, and a regex named capture `(?<x>...)` sets `$x`. So any word that
 * contains this name, in any case, counts as a use of the panel's variables.
 */
const PANEL_NAME = /black_mask_panel_/i;
const GUARD_FILE = 'tools/ci/check-embed-proxy-framing.mjs';
const URI_VAR = '$black_mask_panel_uri';
const UPSTREAM_VAR = '$black_mask_panel_upstream_frames';
const XFO_VAR = '$black_mask_panel_x_frame_options';
const CSP_VAR = '$black_mask_panel_csp';
const ECHO_VAR = '$black_mask_panel_frame_ancestors';
const COMPLETE_VAR = '$black_mask_panel_upstream_complete';
const DECISION_SOURCE = `${URI_VAR}${UPSTREAM_VAR}${COMPLETE_VAR}`;
const RELAX_KEY = '111';
const UPSTREAM_CSP = '$upstream_http_content_security_policy';
const HEADER_TIME = '$upstream_header_time';
/*
 * $upstream_header_time is "-" for an attempt whose header block nginx did not
 * read completely, a time ("0.002") for one it did, and a list ("-, 0.002")
 * when nginx tried several servers. Only the last attempt's entry counts.
 */
export const COMPLETE_KEY = '~(^| )[0-9]+\\.[0-9]+$';
/*
 * The upstream CSP test, pinned byte for byte: exactly `frame-ancestors 'none'`
 * or `frame-ancestors` followed by lower-case scheme://host[:port] origins,
 * which is all 40-black-mask-frame-ancestors.sh writes. The samples below
 * document it; checkPinnedKeys() runs them against this constant.
 */
export const UPSTREAM_KEY =
    "~^frame-ancestors ('none'|[a-z][a-z0-9+.-]*://[a-z0-9.-]+(:[0-9]+)?( [a-z][a-z0-9+.-]*://[a-z0-9.-]+(:[0-9]+)?)*)$";
const PANEL_VARS = [URI_VAR, UPSTREAM_VAR, COMPLETE_VAR, XFO_VAR, CSP_VAR, ECHO_VAR];
const HSTS_INCLUDE = '/etc/nginx/snippets/hsts.conf';
const SECURITY_INCLUDE = '/etc/nginx/snippets/security-headers.conf';
const SITE_INCLUDES = [SECURITY_INCLUDE, HSTS_INCLUDE];
export const MAIN_INCLUDES = [
    '/etc/nginx/mime.types',
    '/etc/nginx/snippets/proxy-common.conf',
    '/etc/nginx/sites-enabled/*.conf',
];
const WEB_HOSTS = ['theblackout.app', 'chat.theblackout.app'];
/* Directives that set a variable, and which argument names it. */
const DEFINES = {
    map: (a) => a[1],
    set: (a) => a[0],
    geo: (a) => (a.length > 1 ? a[1] : a[0]),
    split_clients: (a) => a[1],
    auth_request_set: (a) => a[0],
    perl_set: (a) => a[0],
    js_set: (a) => a[0],
};

/*
 * What the upstream test must accept: every form
 * apps/blackout-client/nginx/docker-entrypoint.d/40-black-mask-frame-ancestors.sh
 * writes. What it must refuse: anything else, because the proxy drops its own
 * framing headers whenever the test passes.
 */
export const UPSTREAM_MUST_MATCH = [
    "frame-ancestors 'none'",
    'frame-ancestors https://mask.example chrome-extension://abcdefghijklmnopabcdefghijklmnop',
    'frame-ancestors https://desktop.example.org:8443',
    'frame-ancestors http://localhost:5173 http://127.0.0.1',
    'frame-ancestors moz-extension://0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9 safari-web-extension://0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9',
];
export const UPSTREAM_MUST_NOT_MATCH = [
    // A browser would find no frame-ancestors directive in these.
    '',
    "default-src 'self'",
    'script-src https://frame-ancestors.example',
    'xframe-ancestors https://a.example',
    'frame-ancestorsx https://a.example',
    '\u000bframe-ancestors https://a.example',
    // Non-ASCII: CSP parsing skips the whole directive.
    'frame-ancestors https://exämple.org',
    // Outside what the client image writes and this design passes on:
    // keywords other than a lone 'none' (.github/cfp_headers sends 'self' on
    // every path, the blackout-web image on its static files), wildcards,
    // paths, other directives,
    // several policies or headers (nginx 1.23+ joins repeated headers with ", ").
    "frame-ancestors 'self'",
    "frame-ancestors 'none' https://a.example",
    'frame-ancestors *',
    'frame-ancestors https://*.example.org',
    'frame-ancestors https:',
    'frame-ancestors https://a.example/',
    'frame-ancestors https://a.example; default-src https://a.example',
    "default-src 'self'; frame-ancestors https://a.example",
    "frame-ancestors https://a.example, default-src 'self'",
    "default-src 'self', frame-ancestors https://a.example",
    'frame-ancestors https://a.example, frame-ancestors https://b.example',
    // A keyword or wildcard after or before a valid origin.
    "frame-ancestors https://a.example 'self'",
    "frame-ancestors 'self' https://a.example",
    'frame-ancestors https://a.example *',
    "frame-ancestors https://a.example 'none'",
    // Upper case: the start-up script lower-cases what it writes.
    "frame-ancestors 'NONE'",
    "FRAME-ANCESTORS 'none'",
    'Frame-Ancestors https://a.example',
    'frame-ancestors HTTPS://A.EXAMPLE',
    'frame-ancestors https://A.example',
    // Characters a host-source cannot hold, and stray whitespace.
    'frame-ancestors https://a_b.example',
    'frame-ancestors https://a.example ',
    'frame-ancestors  https://a.example',
    'frame-ancestors\thttps://a.example',
];

/* $upstream_header_time values: complete last attempt, and not. */
export const COMPLETE_MUST_MATCH = ['0.002', '12.345', '-, 0.001', '0.001 : 0.002', '-, - : 0.000'];
export const COMPLETE_MUST_NOT_MATCH = ['', '-', '0.001, -', '-, -', '0.001 : -', 'x0.001', '0.'];

// ---------------------------------------------------------------------------
// nginx config parsing
// ---------------------------------------------------------------------------

const ESCAPES = { t: '\t', r: '\r', n: '\n', '"': '"', "'": "'", '\\': '\\' };

/** Split an nginx config into words and `{` `}` `;`, as nginx's own tokenizer does. */
export function tokenize(text) {
    const tokens = [];
    let i = 0;
    let line = 1;
    const readEscape = () => {
        const next = text[i + 1];
        if (next !== undefined && Object.hasOwn(ESCAPES, next)) {
            i += 2;
            return ESCAPES[next];
        }
        i += 1;
        return '\\';
    };
    while (i < text.length) {
        const ch = text[i];
        if (ch === '\n') {
            line += 1;
            i += 1;
        } else if (/\s/.test(ch)) {
            i += 1;
        } else if (ch === '#') {
            while (i < text.length && text[i] !== '\n') i += 1;
        } else if (ch === '{' || ch === '}' || ch === ';') {
            tokens.push({ type: ch, line });
            i += 1;
        } else if (ch === '"' || ch === "'") {
            const start = line;
            let value = '';
            i += 1;
            while (i < text.length && text[i] !== ch) {
                if (text[i] === '\\') {
                    value += readEscape();
                    continue;
                }
                if (text[i] === '\n') line += 1;
                value += text[i];
                i += 1;
            }
            if (i >= text.length) throw new Error(`unterminated string starting on line ${start}`);
            i += 1;
            tokens.push({ type: 'word', value, line: start });
        } else {
            const start = line;
            let value = '';
            while (i < text.length && !/[\s;{}]/.test(text[i])) {
                if (text[i] === '\\') {
                    value += readEscape();
                } else if (text[i] === '$' && text[i + 1] === '{') {
                    const close = text.indexOf('}', i);
                    if (close === -1) throw new Error(`unterminated \${ on line ${line}`);
                    value += text.slice(i, close + 1);
                    i = close + 1;
                } else {
                    value += text[i];
                    i += 1;
                }
            }
            tokens.push({ type: 'word', value, line: start });
        }
    }
    return tokens;
}

/**
 * Parse into directives: { name, args, line, block? }. Map entries come out as
 * directives too: the key is the name, the value the single argument.
 */
export function parse(text) {
    const tokens = tokenize(text);
    let pos = 0;
    const readBlock = (depth) => {
        const out = [];
        let words = [];
        const directive = () => ({
            name: words[0].value,
            args: words.slice(1).map((w) => w.value),
            line: words[0].line,
        });
        while (pos < tokens.length) {
            const t = tokens[pos];
            pos += 1;
            if (t.type === 'word') {
                words.push(t);
            } else if (t.type === ';') {
                if (!words.length) throw new Error(`stray ';' on line ${t.line}`);
                out.push(directive());
                words = [];
            } else if (t.type === '{') {
                if (!words.length) throw new Error(`block without a name on line ${t.line}`);
                const d = directive();
                words = [];
                d.block = readBlock(depth + 1);
                out.push(d);
            } else {
                if (depth === 0) throw new Error(`unexpected '}' on line ${t.line}`);
                if (words.length) throw new Error(`missing ';' before line ${t.line}`);
                return out;
            }
        }
        if (depth !== 0) throw new Error("unexpected end of file: missing '}'");
        if (words.length) throw new Error("unexpected end of file: missing ';'");
        return out;
    };
    return readBlock(0);
}

/** Every directive in `nodes`, depth first, with its enclosing blocks. */
function* walk(nodes, ancestors = []) {
    for (const node of nodes) {
        yield { node, ancestors };
        if (node.block) yield* walk(node.block, [...ancestors, node]);
    }
}

/** True when the directive's name or any argument contains the panel name. */
const mentionsPanel = (node) =>
    PANEL_NAME.test(node.name) || node.args.some((a) => PANEL_NAME.test(a));

/** The variable a directive sets, if it is a directive that sets one. */
const definedVar = (node) => DEFINES[node.name]?.(node.args);

/** One add_header line as the panel-location check compares it. */
const renderHeader = (d) => {
    const v = d.args[1] ?? '';
    const shown = v.startsWith('$') ? v : JSON.stringify(v);
    return ['add_header', d.args[0], shown, ...d.args.slice(2)].join(' ');
};

const addHeaders = (nodes) =>
    nodes
        .filter((n) => n.name === 'add_header')
        .map((n) => ({
            header: n.args[0],
            value: n.args[1],
            always: n.args[2] === 'always',
            extra: n.args.slice(n.args[2] === 'always' ? 3 : 2),
            line: n.line,
        }));

// ---------------------------------------------------------------------------
// CSP helpers
// ---------------------------------------------------------------------------

const directivesOf = (csp) =>
    csp
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean);

const directiveName = (d) => d.split(/\s+/)[0].toLowerCase();

/** The CSP with its frame-ancestors directive removed, joined as the original. */
export const withoutFrameAncestors = (csp) =>
    directivesOf(csp)
        .filter((d) => directiveName(d) !== 'frame-ancestors')
        .join('; ');

/** nginx matches regexes against bytes; feed JS the UTF-8 bytes as Latin-1 code units. */
const asBytes = (s) => Buffer.from(s, 'utf8').toString('latin1');

/** Build the JS equivalent of an nginx map regex key (`~re` or `~*re`). */
export function mapKeyRegex(key) {
    if (key.startsWith('~*')) return new RegExp(key.slice(2), 'i');
    if (key.startsWith('~')) return new RegExp(key.slice(1));
    return null;
}

// ---------------------------------------------------------------------------
// checks
// ---------------------------------------------------------------------------

/**
 * Check one proxy. All inputs are file contents; `files` names them for
 * messages. `others` are further files of the same nginx ({ file, text,
 * includes }: nginx.conf and proxy-common.conf, with the includes each may
 * have). Returns a list of { file, line, message }.
 */
export function checkStack({ files, site, securityHeaders, hsts, others = [], client }) {
    const failures = [];
    const fail = (file, line, message) => failures.push({ file, line, message });

    const parseOrFail = (file, text) => {
        try {
            return parse(text);
        } catch (err) {
            fail(file, 0, `cannot parse: ${err.message}`);
            return null;
        }
    };
    const siteTree = parseOrFail(files.site, site);
    const secTree = parseOrFail(files.securityHeaders, securityHeaders);
    const hstsTree = parseOrFail(files.hsts, hsts);
    const clientTree = parseOrFail(files.client, client);
    const otherTrees = others.map((o) => ({ ...o, tree: parseOrFail(o.file, o.text) }));
    if (!siteTree || !secTree || !hstsTree || !clientTree || otherTrees.some((o) => !o.tree)) {
        return failures;
    }

    // --- includes: this guard cannot see into any other file ---------------
    const checkIncludes = (file, tree, allowed) => {
        for (const { node } of walk(tree)) {
            if (node.name !== 'include') continue;
            if (node.args.length !== 1 || !allowed.includes(node.args[0])) {
                fail(
                    file,
                    node.line,
                    `include ${node.args.join(' ')}: this guard cannot see into that file; ` +
                        (allowed.length
                            ? `the only includes allowed here are ${allowed.join(', ')}`
                            : 'this file may not include anything') +
                        ' (put the directives here, or teach the guard the new file)'
                );
            }
        }
    };
    checkIncludes(files.site, siteTree, SITE_INCLUDES);
    checkIncludes(files.securityHeaders, secTree, []);
    checkIncludes(files.hsts, hstsTree, []);
    for (const o of otherTrees) checkIncludes(o.file, o.tree, o.includes ?? []);

    // --- security-headers.conf: what "today's headers" are ------------------
    const sec = addHeaders(secTree);
    const secByName = new Map(sec.map((h) => [h.header.toLowerCase(), h]));
    const secCsp = secByName.get('content-security-policy');
    const secXfo = secByName.get('x-frame-options');
    const secHsts = secByName.get('strict-transport-security');
    if (!secCsp || !secXfo || !secHsts || secXfo.value !== 'DENY') {
        fail(
            files.securityHeaders,
            0,
            'expected Strict-Transport-Security, X-Frame-Options "DENY" and a Content-Security-Policy here; ' +
                'the panel locations restate this set, so change them and this guard together'
        );
        return failures;
    }
    const secFa = directivesOf(secCsp.value).filter((d) => directiveName(d) === 'frame-ancestors');
    if (secFa.length !== 1 || secFa[0] !== "frame-ancestors 'none'") {
        fail(
            files.securityHeaders,
            secCsp.line,
            "the CSP must carry exactly one frame-ancestors directive, frame-ancestors 'none'"
        );
        return failures;
    }
    const relaxedCsp = withoutFrameAncestors(secCsp.value);

    // --- hsts.conf matches the HSTS in security-headers.conf ----------------
    const hstsHeaders = addHeaders(hstsTree);
    if (
        hstsHeaders.length !== 1 ||
        hstsHeaders[0].header !== secHsts.header ||
        hstsHeaders[0].value !== secHsts.value ||
        hstsHeaders[0].always !== secHsts.always
    ) {
        fail(
            files.hsts,
            hstsHeaders[0]?.line ?? 0,
            `must hold exactly the Strict-Transport-Security line of security-headers.conf (${secHsts.value}); ` +
                'the panel locations take HSTS from it'
        );
    }

    // --- the client image's raw-URI rule -----------------------------------
    const clientServer = clientTree.find((n) => n.name === 'server');
    const clientRawRule = (match) => {
        const loc = clientServer?.block?.find(
            (n) => n.name === 'location' && n.args.join(' ') === match
        );
        const cond = loc?.block?.find((n) => n.name === 'if' && n.args.includes('!~'));
        if (!cond || cond.args[0] !== '($request_uri') return null;
        return cond.args[cond.args.indexOf('!~') + 1];
    };
    const clientExact = clientRawRule('= /embed');
    const clientPrefix = clientRawRule('^~ /embed/');
    if (!clientExact || !clientPrefix) {
        fail(
            files.client,
            0,
            'the client image no longer has `location = /embed` and `location ^~ /embed/` with a ' +
                '$request_uri check; the proxies copy those panel paths, so update them together'
        );
    }

    // --- maps (http level of the site file) ---------------------------------
    // Every map whose output names a panel variable, in any case, anywhere in
    // the file: a second one for the same name silently replaces the first.
    const mapsByVar = new Map();
    for (const { node, ancestors } of walk(siteTree)) {
        if (node.name !== 'map' || !PANEL_NAME.test(node.args[1] ?? '')) continue;
        const out = node.args[1].toLowerCase();
        if (!mapsByVar.has(out)) mapsByVar.set(out, []);
        mapsByVar.get(out).push({ node, ancestors });
    }
    const pinnedMaps = new Set();
    const reported = new Set();
    const entriesOf = (mapNode) => {
        const entries = new Map();
        for (const e of mapNode.block ?? []) {
            if (e.block || e.args.length !== 1) {
                fail(files.site, e.line, `map ${mapNode.args[1]}: unexpected entry "${e.name}"`);
                continue;
            }
            entries.set(e.name, e.args[0]);
        }
        return entries;
    };
    const expectMap = (out, source, expected, why) => {
        const found = mapsByVar.get(out) ?? [];
        if (!found.length) {
            fail(files.site, 0, `map ${out} is missing (${why})`);
            return;
        }
        if (found.length > 1) {
            for (const { node } of found) reported.add(node);
            fail(
                files.site,
                found[found.length - 1].node.line,
                `${found.length} maps define ${out} (lines ${found
                    .map(({ node }) => node.line)
                    .join(', ')}: ${found.map(({ node }) => node.args[1]).join(', ')}); ` +
                    'nginx variable names are case-insensitive and the last map replaces the others, ' +
                    'so keep only the pinned one'
            );
            return;
        }
        const { node, ancestors } = found[0];
        pinnedMaps.add(node);
        if (ancestors.length) {
            fail(files.site, node.line, `map ${out} must sit at http level (top of the site file)`);
        }
        if (node.args.length !== 2 || node.args[1] !== out) {
            fail(
                files.site,
                node.line,
                `map ${node.args[1]}: write it as \`map ${source} ${out}\``
            );
        } else if (node.args[0] !== source) {
            fail(files.site, node.line, `map ${out} must read ${source} (${why})`);
        }
        const want = [...expected.entries()].map(([k, v]) => `${k} => ${JSON.stringify(v)}`).sort();
        const got = [...entriesOf(node).entries()]
            .map(([k, v]) => `${k} => ${JSON.stringify(v)}`)
            .sort();
        if (JSON.stringify(want) !== JSON.stringify(got)) {
            fail(
                files.site,
                node.line,
                `map ${out} must be exactly {${want.join('; ')}} (${why}); found {${got.join(
                    '; '
                )}}`
            );
        }
    };

    expectMap(
        URI_VAR,
        '$request_uri',
        new Map([
            ['default', '0'],
            [`~${clientExact ?? '^/embed(\\?|$)'}`, '1'],
            [`~${clientPrefix ?? '^/embed/'}`, '1'],
        ]),
        "the raw-URI rule: the client image's two $request_uri tests, nothing else"
    );
    expectMap(
        UPSTREAM_VAR,
        UPSTREAM_CSP,
        new Map([
            ['default', '0'],
            [UPSTREAM_KEY, '1'],
        ]),
        "the upstream frame-ancestors test, pinned byte for byte: 'none' alone or lower-case origins, " +
            'as the client image writes them; anything else keeps the proxy headers'
    );
    expectMap(
        COMPLETE_VAR,
        HEADER_TIME,
        new Map([
            ['default', '0'],
            [COMPLETE_KEY, '1'],
        ]),
        "fail-safe: relax only after nginx read the upstream's whole header block (its last attempt)"
    );
    expectMap(
        XFO_VAR,
        DECISION_SOURCE,
        new Map([
            ['default', secXfo.value],
            [RELAX_KEY, ''],
        ]),
        'fail-safe: X-Frame-Options stays as security-headers.conf has it unless all three tests pass'
    );
    expectMap(
        CSP_VAR,
        DECISION_SOURCE,
        new Map([
            ['default', secCsp.value],
            [RELAX_KEY, relaxedCsp],
        ]),
        "fail-safe: the default is security-headers.conf's CSP, the relaxed value is that CSP without frame-ancestors"
    );
    expectMap(
        ECHO_VAR,
        DECISION_SOURCE,
        new Map([
            ['default', ''],
            [RELAX_KEY, UPSTREAM_CSP],
        ]),
        "the upstream's frame-ancestors is repeated only when all three tests pass"
    );
    for (const [out, found] of mapsByVar) {
        if (PANEL_VARS.includes(out)) continue;
        for (const { node } of found) {
            reported.add(node);
            fail(files.site, node.line, `unexpected map ${node.args[1]}`);
        }
    }

    // --- the web host's server block ---------------------------------------
    const servers = siteTree.filter(
        (n) =>
            n.name === 'server' &&
            n.block?.some((d) => d.name === 'listen' && /(^|:)443$/.test(d.args[0] ?? '')) &&
            n.block?.some(
                (d) => d.name === 'server_name' && WEB_HOSTS.every((h) => d.args.includes(h))
            )
    );
    if (servers.length !== 1) {
        fail(
            files.site,
            0,
            `expected one HTTPS server block for ${WEB_HOSTS.join(' ')}, found ${servers.length}`
        );
        return failures;
    }
    const web = servers[0];
    if (!web.block.some((d) => d.name === 'include' && d.args[0] === SECURITY_INCLUDE)) {
        fail(
            files.site,
            web.line,
            `the ${WEB_HOSTS[0]} server block must include ${SECURITY_INCLUDE}`
        );
    }
    const locations = web.block.filter((d) => d.name === 'location');
    const find = (spec) => locations.filter((l) => l.args.join(' ') === spec);
    const root = find('/')[0];
    const panels = [];
    for (const spec of ['= /embed', '^~ /embed/']) {
        const found = find(spec);
        if (found.length !== 1) {
            fail(
                files.site,
                web.line,
                `the ${WEB_HOSTS[0]} server block must have exactly one \`location ${spec}\` (found ${found.length})`
            );
        } else {
            panels.push(found[0]);
        }
    }
    if (!root)
        fail(
            files.site,
            web.line,
            'the panel locations must proxy as `location /` does, which is missing'
        );

    // Expected header directives in a panel location, in order.
    const expectedPanelHeaders = [];
    for (const h of sec) {
        const key = h.header.toLowerCase();
        const always = h.always ? ' always' : '';
        if (key === 'strict-transport-security')
            expectedPanelHeaders.push(`include ${HSTS_INCLUDE}`);
        else if (key === 'x-frame-options')
            expectedPanelHeaders.push(`add_header ${h.header} ${XFO_VAR}${always}`);
        else if (key === 'content-security-policy') {
            expectedPanelHeaders.push(`add_header ${h.header} ${CSP_VAR}${always}`);
            expectedPanelHeaders.push(`add_header ${h.header} ${ECHO_VAR}${always}`);
        } else
            expectedPanelHeaders.push(`add_header ${h.header} ${JSON.stringify(h.value)}${always}`);
    }
    const proxyOf = (loc) =>
        loc.block
            .filter((d) => d.name.startsWith('proxy_'))
            .map((d) => [d.name, ...d.args].join(' '));
    const allowedPanelLines = new Set();
    for (const loc of panels) {
        const where = `location ${loc.args.join(' ')}`;
        const headerLines = [];
        for (const d of loc.block) {
            if (d.name.startsWith('proxy_')) continue;
            if (d.name === 'add_header') {
                const line = renderHeader(d);
                headerLines.push(line);
                if (expectedPanelHeaders.includes(line)) allowedPanelLines.add(d);
            } else if (d.name === 'include') {
                headerLines.push(`include ${d.args.join(' ')}`);
            } else {
                fail(
                    files.site,
                    d.line,
                    `${where}: unexpected \`${d.name}\`; a panel location only proxies and sets the panel headers`
                );
            }
        }
        if (JSON.stringify(headerLines) !== JSON.stringify(expectedPanelHeaders)) {
            fail(
                files.site,
                loc.line,
                `${where}: headers must be exactly, in order:\n      ${expectedPanelHeaders.join(
                    '\n      '
                )}\n    found:\n      ${headerLines.join('\n      ')}`
            );
        }
        if (root && JSON.stringify(proxyOf(loc)) !== JSON.stringify(proxyOf(root))) {
            fail(
                files.site,
                loc.line,
                `${where}: must proxy exactly as \`location /\` does (${proxyOf(root).join(
                    '; '
                )}); found ${proxyOf(loc).join('; ') || 'nothing'}`
            );
        }
    }

    // In the web host's block, a non-panel block that sets its own headers drops
    // the server-level set, X-Frame-Options and frame-ancestors 'none' included.
    const panelSet = new Set(panels);
    for (const { node } of walk(web.block)) {
        if (!node.block || panelSet.has(node)) continue;
        const own = addHeaders(node.block);
        if (!own.length) continue;
        const where = `${node.name} ${node.args.join(' ')}`;
        if (!node.block.some((d) => d.name === 'include' && d.args[0] === SECURITY_INCLUDE)) {
            fail(
                files.site,
                node.line,
                `${where} sets add_header without including ${SECURITY_INCLUDE}, so it loses X-Frame-Options and frame-ancestors 'none'`
            );
        }
        for (const h of own) {
            if (['x-frame-options', 'content-security-policy'].includes(h.header.toLowerCase())) {
                fail(
                    files.site,
                    h.line,
                    `${where} sets its own ${h.header}; only the two panel locations may change framing`
                );
            }
        }
    }

    // --- the panel name anywhere else ---------------------------------------
    // Allowed: the pinned maps (their content is checked above) and the
    // expected header lines in the two panel locations. Anything else that
    // mentions the name, in any case, in any file read here, fails.
    const scan = (file, tree) => {
        for (const { node, ancestors } of walk(tree)) {
            if (pinnedMaps.has(node) || ancestors.some((a) => pinnedMaps.has(a))) continue;
            if (reported.has(node) || ancestors.some((a) => reported.has(a))) continue;
            if (allowedPanelLines.has(node) || !mentionsPanel(node)) continue;
            const target = definedVar(node);
            if (target && PANEL_NAME.test(target)) {
                fail(
                    file,
                    node.line,
                    `${node.name} sets ${target}: the panel's variables may be set only by their pinned maps ` +
                        '(nginx variable names are case-insensitive, and a set or a later map replaces the value)'
                );
            } else {
                fail(
                    file,
                    node.line,
                    `${node.name} mentions a black_mask_panel_ name (any case, $x, \${x} or a regex capture) ` +
                        "outside the pinned maps and the panel locations' header lines"
                );
            }
        }
    };
    scan(files.site, siteTree);
    scan(files.securityHeaders, secTree);
    scan(files.hsts, hstsTree);
    for (const o of otherTrees) scan(o.file, o.tree);

    return failures;
}

/**
 * The pinned regexes against the samples that document them: an edit to
 * UPSTREAM_KEY or COMPLETE_KEY that accepts more fails here. Both use only
 * syntax that JS and nginx's PCRE read the same way, which is what makes
 * running them in JS meaningful; the guard compares the configs to them byte
 * for byte, so a PCRE-only construct in a config cannot pass.
 */
export function checkPinnedKeys({ upstreamKey = UPSTREAM_KEY, completeKey = COMPLETE_KEY } = {}) {
    const failures = [];
    const fail = (message) => failures.push({ file: GUARD_FILE, line: 0, message });
    const pcreOnly = /\\[QEKRhHvVpPxXgGkN0-9]|\(\?|\[\[:/;
    for (const [name, key] of [
        ['UPSTREAM_KEY', upstreamKey],
        ['COMPLETE_KEY', completeKey],
    ]) {
        if (!key.startsWith('~') || key.startsWith('~*'))
            fail(`${name} must be a case-sensitive regex (~)`);
        if (pcreOnly.test(key)) fail(`${name} uses syntax JS and PCRE may read differently`);
    }
    const upstream = mapKeyRegex(upstreamKey);
    for (const sample of UPSTREAM_MUST_MATCH) {
        if (!upstream.test(asBytes(sample))) {
            fail(`UPSTREAM_KEY must accept the client image's ${JSON.stringify(sample)}`);
        }
    }
    for (const sample of UPSTREAM_MUST_NOT_MATCH) {
        if (upstream.test(asBytes(sample))) {
            fail(
                `UPSTREAM_KEY accepts ${JSON.stringify(
                    sample
                )}; it must accept only one frame-ancestors ` +
                    "list, 'none' alone or plain lower-case origins, or the proxy drops its framing headers for it"
            );
        }
    }
    const complete = mapKeyRegex(completeKey);
    for (const sample of COMPLETE_MUST_MATCH) {
        if (!complete.test(sample)) fail(`COMPLETE_KEY must accept ${JSON.stringify(sample)}`);
    }
    for (const sample of COMPLETE_MUST_NOT_MATCH) {
        if (complete.test(sample)) fail(`COMPLETE_KEY accepts ${JSON.stringify(sample)}`);
    }
    return failures;
}

export function loadStack(repoRoot, stack) {
    const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');
    const files = {
        site: stack.site,
        securityHeaders: `${stack.snippets}/security-headers.conf`,
        hsts: `${stack.snippets}/hsts.conf`,
        client: CLIENT_CONF,
    };
    return {
        files,
        site: read(files.site),
        securityHeaders: read(files.securityHeaders),
        hsts: read(files.hsts),
        client: read(files.client),
        others: [
            { file: stack.main, includes: MAIN_INCLUDES },
            { file: `${stack.snippets}/proxy-common.conf`, includes: [] },
        ].map((o) => ({ ...o, text: read(o.file) })),
    };
}

export function runAll(repoRoot = REPO_ROOT) {
    const failures = [...checkPinnedKeys()];
    for (const stack of STACKS) failures.push(...checkStack(loadStack(repoRoot, stack)));
    return failures;
}

function runCli() {
    const failures = runAll();
    if (failures.length) {
        console.error('check-embed-proxy-framing: FAIL\n');
        for (const f of failures)
            console.error(`  ${f.file}${f.line ? `:${f.line}` : ''} — ${f.message}`);
        console.error(
            [
                '',
                'The front proxies may drop their own X-Frame-Options and frame-ancestors only on the',
                "two Black Mask panel locations, only for the panel's raw URI, and only when the client",
                "container's response carries a frame-ancestors list in a complete header block. Every",
                'other case must keep security-headers.conf exactly.',
                'See docs/black-mask-chat-panel-and-account-link.md (step 2).',
            ].join('\n')
        );
        process.exit(1);
    }
    console.log(
        `check-embed-proxy-framing: OK (${STACKS.map((s) => s.name).join(
            ', '
        )}: panel locations, pinned maps, no other use of the panel's variables, known includes ` +
            'only, and headers match security-headers.conf)'
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runCli();
}
