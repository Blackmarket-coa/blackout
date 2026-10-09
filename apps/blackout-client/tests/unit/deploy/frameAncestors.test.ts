// @vitest-environment node
/**
 * Framing policy for the web client's nginx image (launch-plan step B2).
 *
 * Two halves:
 *  1. The start-up script that turns BLACK_MASK_FRAME_ANCESTORS into the chat
 *     panel's framing header. Run for real under `sh` — the same POSIX script
 *     the nginx image runs under busybox ash.
 *  2. The structure of docker-nginx.conf: the allow-list file is included in
 *     the two panel locations and nowhere else, every other location keeps
 *     frame-ancestors 'none' (accounting for nginx's add_header inheritance
 *     rule), and the panel locations agree with the client's isEmbedPath().
 *
 * The live response headers were also checked against a running nginx; see
 * docs/black-mask-chat-panel-and-account-link.md (B2).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { isEmbedPath } from '../../../src/app/features/black-mask-embed/embedPaths';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SCRIPT = path.join(clientRoot, 'nginx/docker-entrypoint.d/40-black-mask-frame-ancestors.sh');
const NGINX_CONF = path.join(clientRoot, 'docker-nginx.conf');
const DOCKERFILE = path.join(clientRoot, 'Dockerfile');
const DEFAULT_EMBED_CONF = path.join(clientRoot, 'nginx/embed-frame.conf');
const DENY_CONF = path.join(clientRoot, 'nginx/frame-deny.conf');

const DENY_XFO = 'add_header X-Frame-Options "DENY" always;';
const DENY_CSP = `add_header Content-Security-Policy "frame-ancestors 'none'" always;`;
const CHROME_ID = 'abcdefghijklmnopabcdefghijklmnop';
const UUID = '0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9';

const tmpDirs: string[] = [];
afterEach(() => {
    for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const run = (value: string | undefined, confPath?: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-frame-'));
    tmpDirs.push(dir);
    const conf = confPath ?? path.join(dir, 'blackout', 'embed-frame.conf');
    const env: Record<string, string> = {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        BLACK_MASK_FRAME_CONF: conf,
    };
    if (value !== undefined) env.BLACK_MASK_FRAME_ANCESTORS = value;
    const result = spawnSync('sh', [SCRIPT], { env, encoding: 'utf8', cwd: dir });
    const written = fs.existsSync(conf) ? fs.readFileSync(conf, 'utf8') : null;
    return {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        conf: written,
        confPath: conf,
    };
};

const headerLines = (conf: string | null) =>
    (conf ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('add_header'));

const expectDenied = (conf: string | null) => {
    expect(headerLines(conf)).toEqual([DENY_XFO, DENY_CSP]);
};

const expectAllowed = (conf: string | null, origins: string) => {
    expect(headerLines(conf)).toEqual([
        `add_header Content-Security-Policy "frame-ancestors ${origins}" always;`,
    ]);
};

describe('BLACK_MASK_FRAME_ANCESTORS -> chat panel framing header', () => {
    it.each([
        ['unset', undefined],
        ['empty', ''],
        ['only separators and whitespace', ' ,  ,\t\n, '],
    ])('%s: the panel cannot be framed', (_label, value) => {
        const r = run(value);
        expect(r.status).toBe(0);
        expectDenied(r.conf);
    });

    it('allows a single https origin, with no X-Frame-Options to contradict it', () => {
        const r = run('https://vault.example.org');
        expect(r.status).toBe(0);
        expectAllowed(r.conf, 'https://vault.example.org');
        expect(r.conf).not.toContain('X-Frame-Options');
        expect(r.stdout).toContain('may be framed by: https://vault.example.org');
    });

    it('allows a Chromium extension origin', () => {
        expectAllowed(
            run(`chrome-extension://${CHROME_ID}`).conf,
            `chrome-extension://${CHROME_ID}`
        );
    });

    it('takes several origins separated by commas, spaces and newlines; lower-cases and de-duplicates', () => {
        const r = run(
            ` chrome-extension://${CHROME_ID.toUpperCase()},https://Vault.Example.org\nhttps://desktop.example.org:8443 , https://vault.example.org\r`
        );
        expect(r.status).toBe(0);
        expectAllowed(
            r.conf,
            `chrome-extension://${CHROME_ID} https://vault.example.org https://desktop.example.org:8443`
        );
    });

    it('allows loopback http for local testing only', () => {
        expectAllowed(
            run('http://localhost:5173 http://127.0.0.1').conf,
            'http://localhost:5173 http://127.0.0.1'
        );
    });

    it('allows Firefox and Safari extension origins, warning that Firefox ids are per-install', () => {
        const r = run(`moz-extension://${UUID} safari-web-extension://${UUID.toUpperCase()}`);
        expectAllowed(r.conf, `moz-extension://${UUID} safari-web-extension://${UUID}`);
        expect(r.stderr).toContain('per-install');
    });

    it.each([
        ['*'],
        ['https://*'],
        ['https://*.example.org'],
        ['*.example.org'],
        ['https:'],
        ['https://'],
        ['example.org'],
        ['https://example.org/'],
        ['https://example.org/path'],
        ['https://example.org?x=1'],
        ['https://example.org#x'],
        ['https://user@example.org'],
        ['http://example.org'],
        ['http://localhost.example.org'],
        ['https://localhost'],
        ['https://10.0.0.1'],
        ['https://-bad.example.org'],
        ['https://example.org:0'],
        ['https://example.org:65536'],
        ['https://example.org:123456'],
        ["'self'"],
        ["'none'"],
        ['self'],
        ['https://example.org;'],
        ['https://example.org;script-src'],
        ['https://example.org"'],
        ['https://exa"mple.org'],
        ['https://example.org$host'],
        ['https://example.org{'],
        ['https://exämple.org'],
        ['https://exa\u0007mple.org'],
        ['ftp://example.org'],
        ['data:'],
        ['blob:https://example.org'],
        ['chrome-extension://abc'],
        [`chrome-extension://${'z'.repeat(32)}`],
        [`chrome-extension://${CHROME_ID}/popup.html`],
        [`chrome-extension://${CHROME_ID}:8080`],
        ['moz-extension://not-a-uuid'],
        ['chrome-extension://*'],
    ])('rejects %j and keeps the panel unframeable', (value) => {
        const r = run(value);
        expect(r.status).toBe(0);
        expectDenied(r.conf);
        expect(r.stderr).toContain('rejected');
    });

    it('rejects the whole list when any one entry is invalid', () => {
        const r = run(
            `https://vault.example.org, https://*.example.org, chrome-extension://${CHROME_ID}`
        );
        expect(r.status).toBe(0);
        expectDenied(r.conf);
        expect(r.stderr).toContain('[https://*.example.org]');
        expect(r.stderr).not.toContain('[https://vault.example.org]');
    });

    it('splits on whitespace inside an origin, which then fails validation', () => {
        expectDenied(run('https://exa mple.org').conf);
    });

    it('overwrites an earlier allow-list when the variable is later emptied (container restart)', () => {
        const first = run('https://vault.example.org');
        expectAllowed(first.conf, 'https://vault.example.org');
        const second = run('', first.confPath);
        expectDenied(second.conf);
    });

    it('exits 0 and warns when it cannot write the file, so nginx still starts', () => {
        const r = run('https://vault.example.org', '/proc/blackout-no-such-dir/embed-frame.conf');
        expect(r.status).toBe(0);
        expect(r.conf).toBeNull();
        expect(r.stderr).toContain('could not write');
    });
});

// ---------------------------------------------------------------------------
// docker-nginx.conf structure
// ---------------------------------------------------------------------------

type Block = { header: string; body: string };

/** Top-level `location ... { ... }` blocks of the single server block, with their bodies. */
const locationBlocks = (conf: string): Block[] => {
    const blocks: Block[] = [];
    const re = /location\s+([^{]+)\{/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(conf))) {
        let depth = 1;
        let i = re.lastIndex;
        for (; i < conf.length && depth > 0; i += 1) {
            if (conf[i] === '{') depth += 1;
            else if (conf[i] === '}') depth -= 1;
        }
        blocks.push({ header: match[1].trim(), body: conf.slice(re.lastIndex, i - 1) });
        re.lastIndex = i;
    }
    return blocks;
};

const stripComments = (text: string) =>
    text
        .split('\n')
        .map((line) => line.replace(/#.*$/, ''))
        .join('\n');

describe('docker-nginx.conf framing structure', () => {
    const conf = stripComments(fs.readFileSync(NGINX_CONF, 'utf8'));
    const blocks = locationBlocks(conf);
    const serverLevel = blocks.reduce((rest, b) => rest.replace(b.body, ''), conf);

    it('denies framing at server level', () => {
        expect(serverLevel).toContain('include /etc/nginx/blackout/frame-deny.conf;');
        expect(serverLevel).not.toContain('embed-frame.conf');
    });

    it('includes the chat-panel framing file in exactly the two panel locations', () => {
        const withEmbed = blocks
            .filter((b) => b.body.includes('embed-frame.conf'))
            .map((b) => b.header);
        expect(withEmbed).toEqual(['= /embed', '^~ /embed/']);
    });

    it('re-includes a framing policy in every location that sets its own add_header', () => {
        for (const block of blocks) {
            if (!/\badd_header\b/.test(block.body)) continue;
            expect(
                block.body.includes('frame-deny.conf') || block.body.includes('embed-frame.conf'),
                `location ${block.header} sets add_header but drops the inherited framing headers`
            ).toBe(true);
        }
    });

    it('leaves the app catch-all on the server-level deny (no add_header of its own)', () => {
        const catchAll = blocks.find((b) => b.header === '/');
        expect(catchAll).toBeDefined();
        expect(catchAll!.body).not.toMatch(/\badd_header\b|\binclude\b/);
    });

    it('refuses panel requests whose raw URI does not literally start with /embed', () => {
        const exact = blocks.find((b) => b.header === '= /embed')!;
        const prefix = blocks.find((b) => b.header === '^~ /embed/')!;
        // ...and answers the refusal with the deny headers, not the panel's.
        expect(exact.body).toMatch(
            /if \(\$request_uri !~ "\^\/embed\(\\\?\|\$\)"\) \{\s*include \/etc\/nginx\/blackout\/frame-deny\.conf;\s*return 404;/
        );
        expect(prefix.body).toMatch(
            /if \(\$request_uri !~ "\^\/embed\/"\) \{\s*include \/etc\/nginx\/blackout\/frame-deny\.conf;\s*return 404;/
        );
    });

    it('agrees with the client on which paths are the panel', () => {
        // nginx: `= /embed` or prefix `/embed/`.
        const nginxIsPanel = (p: string) => p === '/embed' || p.startsWith('/embed/');
        for (const p of [
            '/embed',
            '/embed/',
            '/embed/dms/x',
            '/embedded',
            '/embed-x',
            '/',
            '/x/embed',
        ]) {
            expect(isEmbedPath(p), p).toBe(nginxIsPanel(p));
        }
    });

    it('ships both include files denying framing by default, and copies them where the config looks', () => {
        for (const file of [DEFAULT_EMBED_CONF, DENY_CONF]) {
            expect(headerLines(stripComments(fs.readFileSync(file, 'utf8')))).toEqual([
                DENY_XFO,
                DENY_CSP,
            ]);
        }
        const dockerfile = fs.readFileSync(DOCKERFILE, 'utf8');
        expect(dockerfile).toContain('nginx/frame-deny.conf /etc/nginx/blackout/frame-deny.conf');
        expect(dockerfile).toContain('nginx/embed-frame.conf /etc/nginx/blackout/embed-frame.conf');
        expect(dockerfile).toContain(
            'nginx/docker-entrypoint.d/40-black-mask-frame-ancestors.sh /docker-entrypoint.d/40-black-mask-frame-ancestors.sh'
        );
        // The script's default output path is the file the config includes.
        expect(fs.readFileSync(SCRIPT, 'utf8')).toContain(
            'BLACK_MASK_FRAME_CONF:-/etc/nginx/blackout/embed-frame.conf'
        );
    });

    it('keeps the script executable in the repository (the nginx entrypoint skips non-executable scripts)', () => {
        expect(fs.statSync(SCRIPT).mode & 0o111).not.toBe(0);
    });
});
