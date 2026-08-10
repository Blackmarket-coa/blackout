#!/usr/bin/env node
/**
 * Trust-claim guard: keep "every private room and DM is end-to-end encrypted"
 * true after the people who made it true have moved on.
 *
 * The 2026-08-10 encryption audit found the claim was false in both halves of
 * the stack. The server-side half is now enforced by the compiler:
 * `matrixClient.createRoom` takes a REQUIRED `encrypted` flag, so a new API call
 * site cannot omit the decision. The client half has no such lever — the
 * matrix-js-sdk `createRoom` treats encryption as one optional field among many,
 * so forgetting it is silent, produces a working room, and looks exactly like a
 * room that was deliberately left public.
 *
 * This guard closes that gap. It scans client `createRoom(...)` call sites whose
 * argument is an object literal and requires each to make an encryption
 * decision. It also asserts the server-side flag is still required, so nobody
 * can quietly restore the old default by making it optional.
 *
 * A call site satisfies the guard by doing any of:
 *   - passing `encryption` / `encrypted` (the shared create-room helper's field)
 *   - putting `m.room.encryption` in `initial_state`, usually via
 *     `createRoomEncryptionState()`
 *   - being a space (`m.space` / `RoomType.Space`) — spaces hold hierarchy
 *     state, never messages, so there is nothing to encrypt
 *   - carrying an explicit `e2ee-guard-allow: <reason>` comment inside the call
 *
 * Call sites whose argument is a variable rather than a literal are skipped on
 * purpose: those are wrapper functions (`createRoom(mx, data)`), and the real
 * decision lives at their callers, which this guard does check.
 *
 * Run: pnpm guard:room-encryption
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const CLIENT_ROOT = 'apps/blackout-client/src';
const API_CLIENT_FILE = 'packages/api/src/integrations/matrix-client.ts';

/** Any of these inside the call literal means the decision was made. */
const DECISION_MARKERS = ['encryption', 'encrypted', 'initial_state', 'createRoomEncryptionState'];

/** Spaces carry no messages, so encryption does not apply to them. */
const SPACE_MARKERS = ['m.space', 'RoomType.Space'];

const ALLOW_MARKER = 'e2ee-guard-allow:';

function listFiles(root) {
    try {
        return execSync(`git ls-files ${root}`, { encoding: 'utf8' })
            .split('\n')
            .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
    } catch (err) {
        console.error(`check-room-encryption: failed to enumerate ${root}:`, err.message);
        process.exit(2);
    }
}

/**
 * Given the index of the `(` opening a call, return the source between it and
 * its matching `)`. Tracks nesting so nested object/array literals and calls
 * are consumed whole. Returns null when unbalanced (truncated file, parse
 * confusion) so the caller can skip rather than guess.
 */
function callArgsAt(text, openParen) {
    let depth = 0;
    for (let i = openParen; i < text.length; i += 1) {
        const ch = text[i];
        if (ch === '(' || ch === '[' || ch === '{') depth += 1;
        else if (ch === ')' || ch === ']' || ch === '}') {
            depth -= 1;
            if (depth === 0) return text.slice(openParen + 1, i);
        }
    }
    return null;
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/**
 * Remove comments so prose cannot satisfy the guard. Without this, a call site
 * that merely *mentions* encryption in an explanatory comment passes while
 * creating a plaintext room — which is precisely the failure mode this guard
 * exists to catch, and it slipped through the first version.
 */
const stripComments = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/**
 * Analyze one source file. Exported so the guard's own test can exercise it on
 * source strings without a checkout shaped like the repo.
 *
 * @returns {{ violations: Array<{file: string, line: number, reason: string}>, checked: string[] }}
 */
export function analyzeSource(file, text) {
    const violations = [];
    const checked = [];
    const callRe = /\bcreateRoom\s*\(/g;
    let match;

    while ((match = callRe.exec(text)) !== null) {
        const openParen = match.index + match[0].length - 1;
        const args = callArgsAt(text, openParen);
        if (args === null) continue;

        // Declarations, not calls: `createRoom(input: {...})` and other typed
        // signatures. A typed parameter list starts `name:` or `name?:`.
        if (/^\s*\w+\s*\??\s*:/.test(args)) continue;

        // Only object-literal arguments are statically decidable. `createRoom(mx, data)`
        // and `createRoom(options)` are wrappers — their callers are checked instead.
        if (!args.includes('{')) continue;

        const line = lineOf(text, match.index);
        checked.push(`${file}:${line}`);

        // The allow-marker is deliberately a comment, so it is read before stripping.
        if (args.includes(ALLOW_MARKER)) continue;

        // Everything else must appear in real code, not in a comment about it.
        const code = stripComments(args);
        if (SPACE_MARKERS.some((m) => code.includes(m))) continue;
        if (DECISION_MARKERS.some((m) => code.includes(m))) continue;

        violations.push({
            file,
            line,
            reason: 'createRoom(...) makes no encryption decision',
        });
    }

    return { violations, checked };
}

/** True when the server-side flag is still a required field. */
export const serverFlagIsRequired = (source) => /^\s*encrypted:\s*boolean;/m.test(source);

function runCli() {
    const violations = [];
    const checked = [];

    for (const file of listFiles(CLIENT_ROOT)) {
        const { violations: v, checked: c } = analyzeSource(file, readFileSync(file, 'utf8'));
        violations.push(...v);
        checked.push(...c);
    }

    // The server-side guarantee is the compiler, not this script — but only while
    // the flag stays required. Catch a silent downgrade to optional.
    if (!serverFlagIsRequired(readFileSync(API_CLIENT_FILE, 'utf8'))) {
        violations.push({
            file: API_CLIENT_FILE,
            line: 0,
            reason:
                'matrixClient.createRoom must declare `encrypted: boolean;` as a required field — ' +
                'making it optional restores the silent-plaintext default the audit removed',
        });
    }

    if (violations.length > 0) {
        console.error('check-room-encryption: FAIL\n');
        for (const v of violations) {
            console.error(`  ${v.file}:${v.line} — ${v.reason}`);
        }
        console.error(
            [
                '',
                'Every room-creating call must say whether the room is encrypted.',
                '',
                'Private rooms and DMs:',
                '  initial_state: [createRoomEncryptionState()]   // from app/utils/matrix-crypto',
                '  or, via the shared create-room helper: encryption: true',
                '',
                'Publicly joinable rooms stay unencrypted — say so explicitly:',
                '  encryption: false',
                '',
                'Anything else needs a reason a reader can check:',
                '  // e2ee-guard-allow: bot posts here and cannot hold Megolm keys',
                '',
                'See docs/audits/2026-08-10-encryption-audit.md and TRUST.md.',
            ].join('\n')
        );
        process.exit(1);
    }

    console.log(
        `check-room-encryption: OK (${checked.length} client call site(s) checked, ` +
            'server-side flag still required)'
    );
}

// Only run the repo-wide scan when invoked directly, so the test can import
// `analyzeSource` without triggering it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runCli();
}
