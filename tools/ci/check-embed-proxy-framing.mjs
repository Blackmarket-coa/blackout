#!/usr/bin/env node
/**
 * Black Mask chat panel: framing guard for the two front proxies.
 *
 * The web client image (apps/blackout-client) decides whether the chat panel
 * at /embed may be framed, from BLACK_MASK_FRAME_ANCESTORS. The front proxies
 * in infra/nginx and infra/single-server-baseline add their own
 * X-Frame-Options: DENY and a CSP ending in frame-ancestors 'none' to
 * everything (snippets/security-headers.conf). Browsers enforce every CSP a
 * response carries, so on the two panel locations each proxy leaves out its
 * own framing headers, but only when the raw request URI is the panel's and
 * the client container's response carries a frame-ancestors list in the form
 * the image writes. Everywhere else, and in every failure case, the proxy
 * sends exactly the security-headers.conf set.
 *
 * Nothing else checks that arrangement, and every way it can break fails
 * open. This guard fails when, in either proxy:
 *   - a panel location (`= /embed`, `^~ /embed/`) is missing, or proxies
 *     differently from `location /`;
 *   - the raw-URI rule is missing or no longer the client image's;
 *   - the fail-safe is weakened: a map default no longer equals today's header,
 *     the relax condition stops requiring both the raw URI and the upstream's
 *     frame-ancestors, or the upstream test accepts anything beyond a single
 *     frame-ancestors list ('none' alone or plain origins);
 *   - the relaxed CSP differs from security-headers.conf in anything except
 *     the frame-ancestors directive, or the panel's other headers differ from
 *     security-headers.conf / hsts.conf;
 *   - any other location can get the relaxed headers, or a location in the
 *     web host's server block sets its own headers without restoring
 *     security-headers.conf.
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

const VAR_PREFIX = '$black_mask_panel_';
const URI_VAR = '$black_mask_panel_uri';
const UPSTREAM_VAR = '$black_mask_panel_upstream_frames';
const XFO_VAR = '$black_mask_panel_x_frame_options';
const CSP_VAR = '$black_mask_panel_csp';
const ECHO_VAR = '$black_mask_panel_frame_ancestors';
const DECISION_SOURCE = `${URI_VAR}${UPSTREAM_VAR}`;
const UPSTREAM_CSP = '$upstream_http_content_security_policy';
const HSTS_INCLUDE = '/etc/nginx/snippets/hsts.conf';
const SECURITY_INCLUDE = '/etc/nginx/snippets/security-headers.conf';
const WEB_HOSTS = ['theblackout.app', 'chat.theblackout.app'];

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
    // keywords other than a lone 'none' (the blackout-web image and
    // .github/cfp_headers send 'self'), wildcards, paths, other directives,
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
];

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

const usesPanelVar = (node) =>
    node.name.includes(VAR_PREFIX) || node.args.some((a) => a.includes(VAR_PREFIX));

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
 * messages. Returns a list of { file, line, message }.
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
    if (!siteTree || !secTree || !hstsTree || !clientTree) return failures;

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
    for (const [file, tree] of [
        [files.securityHeaders, secTree],
        [files.hsts, hstsTree],
    ]) {
        for (const { node } of walk(tree)) {
            if (usesPanelVar(node)) {
                fail(
                    file,
                    node.line,
                    `${node.name} uses a ${VAR_PREFIX}* variable outside the panel locations`
                );
            }
        }
    }

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

    // --- other files in the inheritance chain never use the variables ------
    for (const { file, text } of others) {
        const tree = parseOrFail(file, text);
        if (!tree) continue;
        for (const { node } of walk(tree)) {
            if (usesPanelVar(node)) {
                fail(
                    file,
                    node.line,
                    `${node.name} uses a ${VAR_PREFIX}* variable outside the panel locations`
                );
            }
        }
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
    const maps = new Map();
    for (const node of siteTree) {
        if (node.name !== 'map') continue;
        const out = node.args[1];
        if (out?.startsWith(VAR_PREFIX)) {
            if (maps.has(out)) fail(files.site, node.line, `map ${out} is defined twice`);
            maps.set(out, node);
        }
    }
    for (const { node, ancestors } of walk(siteTree)) {
        if (node.name === 'map' && ancestors.length && node.args[1]?.startsWith(VAR_PREFIX)) {
            fail(
                files.site,
                node.line,
                `map ${node.args[1]} must sit at http level (top of the site file)`
            );
        }
    }
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
        const node = maps.get(out);
        if (!node) {
            fail(files.site, 0, `map ${out} is missing (${why})`);
            return null;
        }
        if (node.args.length !== 2 || node.args[0] !== source) {
            fail(files.site, node.line, `map ${out} must read ${source} (${why})`);
        }
        const entries = entriesOf(node);
        if (expected) {
            const want = [...expected.entries()]
                .map(([k, v]) => `${k} => ${JSON.stringify(v)}`)
                .sort();
            const got = [...entries.entries()]
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
        }
        return entries;
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

    const upstream = expectMap(
        UPSTREAM_VAR,
        UPSTREAM_CSP,
        null,
        'the upstream frame-ancestors test'
    );
    if (upstream) {
        const regexKeys = [...upstream.keys()].filter((k) => k !== 'default');
        if (
            upstream.get('default') !== '0' ||
            regexKeys.length !== 1 ||
            upstream.get(regexKeys[0]) !== '1'
        ) {
            fail(
                files.site,
                maps.get(UPSTREAM_VAR).line,
                `map ${UPSTREAM_VAR} must be {default 0; <one regex> 1}: anything that does not match keeps the proxy's headers`
            );
        } else {
            let re = null;
            try {
                re = mapKeyRegex(regexKeys[0]);
            } catch (err) {
                fail(
                    files.site,
                    maps.get(UPSTREAM_VAR).line,
                    `cannot read the regex: ${err.message}`
                );
            }
            if (!re) {
                fail(
                    files.site,
                    maps.get(UPSTREAM_VAR).line,
                    `map ${UPSTREAM_VAR}: its key must be a regex (~...)`
                );
            } else {
                for (const sample of UPSTREAM_MUST_MATCH) {
                    if (!re.test(asBytes(sample))) {
                        fail(
                            files.site,
                            maps.get(UPSTREAM_VAR).line,
                            `the upstream test must accept the client image's ${JSON.stringify(
                                sample
                            )}`
                        );
                    }
                }
                for (const sample of UPSTREAM_MUST_NOT_MATCH) {
                    if (re.test(asBytes(sample))) {
                        fail(
                            files.site,
                            maps.get(UPSTREAM_VAR).line,
                            `the upstream test accepts ${JSON.stringify(
                                sample
                            )}; it must accept only one ` +
                                "frame-ancestors list: 'none' alone or plain origins, or the proxy drops its framing headers for it"
                        );
                    }
                }
            }
        }
    }

    expectMap(
        XFO_VAR,
        DECISION_SOURCE,
        new Map([
            ['default', secXfo.value],
            ['11', ''],
        ]),
        'fail-safe: X-Frame-Options stays as security-headers.conf has it unless both tests pass'
    );
    expectMap(
        CSP_VAR,
        DECISION_SOURCE,
        new Map([
            ['default', secCsp.value],
            ['11', relaxedCsp],
        ]),
        "fail-safe: the default is security-headers.conf's CSP, the relaxed value is that CSP without frame-ancestors"
    );
    expectMap(
        ECHO_VAR,
        DECISION_SOURCE,
        new Map([
            ['default', ''],
            ['11', UPSTREAM_CSP],
        ]),
        "the upstream's frame-ancestors is repeated only when both tests pass"
    );
    for (const out of maps.keys()) {
        if (![URI_VAR, UPSTREAM_VAR, XFO_VAR, CSP_VAR, ECHO_VAR].includes(out)) {
            fail(files.site, maps.get(out).line, `unexpected map ${out}`);
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
    for (const loc of panels) {
        const where = `location ${loc.args.join(' ')}`;
        const headerLines = [];
        for (const d of loc.block) {
            if (d.name.startsWith('proxy_')) continue;
            if (d.name === 'add_header') {
                const v = d.args[1] ?? '';
                const shown = v.startsWith('$') ? v : JSON.stringify(v);
                headerLines.push(['add_header', d.args[0], shown, ...d.args.slice(2)].join(' '));
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

    // --- nothing else gets the relaxed headers -----------------------------
    const panelSet = new Set(panels);
    for (const { node, ancestors } of walk(siteTree)) {
        if (node === maps.get(node.args[1]) || ancestors.some((a) => maps.get(a.args[1]) === a))
            continue;
        if (panelSet.has(node) || ancestors.some((a) => panelSet.has(a))) continue;
        if (usesPanelVar(node)) {
            fail(
                files.site,
                node.line,
                `${node.name} uses a ${VAR_PREFIX}* variable outside the two panel locations`
            );
        }
    }
    // In the web host's block, a non-panel block that sets its own headers drops
    // the server-level set, X-Frame-Options and frame-ancestors 'none' included.
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
        others: [stack.main, `${stack.snippets}/proxy-common.conf`].map((file) => ({
            file,
            text: read(file),
        })),
    };
}

export function runAll(repoRoot = REPO_ROOT) {
    const failures = [];
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
                "container's response carries a frame-ancestors list. Every other case must keep",
                'security-headers.conf exactly. See docs/black-mask-chat-panel-and-account-link.md (step 2).',
            ].join('\n')
        );
        process.exit(1);
    }
    console.log(
        `check-embed-proxy-framing: OK (${STACKS.map((s) => s.name).join(
            ', '
        )}: panel locations, raw-URI rule, ` +
            'fail-safe maps, and headers match security-headers.conf)'
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runCli();
}
