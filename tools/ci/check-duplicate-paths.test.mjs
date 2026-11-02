import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
    checkCaseInsensitivePathCollisions,
    findCaseOnlyNameCollisions,
    nameWithoutLastExtension,
} from './check-duplicate-paths.mjs';

const scriptPath = fileURLToPath(new URL('./check-duplicate-paths.mjs', import.meta.url));

const TOOLBAG = 'apps/blackout-client/src/app/features/coalition/toolbag';

test('the tool-bag trio at f0b6469 gives exactly the ToolBag.tsx / toolbag.ts group', () => {
    const files = [`${TOOLBAG}/ToolBag.css.ts`, `${TOOLBAG}/ToolBag.tsx`, `${TOOLBAG}/toolbag.ts`];
    assert.deepEqual(findCaseOnlyNameCollisions(files), [
        [`${TOOLBAG}/ToolBag.tsx`, `${TOOLBAG}/toolbag.ts`],
    ]);
    // The whole paths differ, so the older check alone missed it.
    assert.deepEqual(checkCaseInsensitivePathCollisions(files), []);
});

test('a component beside its .css.ts styles passes', () => {
    assert.deepEqual(findCaseOnlyNameCollisions(['x/ToolBag.tsx', 'x/ToolBag.css.ts']), []);
});

test('the same stem with different extensions passes', () => {
    assert.deepEqual(findCaseOnlyNameCollisions(['x/index.ts', 'x/index.css']), []);
});

test('only the last extension is removed', () => {
    // ToolBag against toolbag.css: removing every extension would flag this.
    assert.deepEqual(findCaseOnlyNameCollisions(['x/ToolBag.tsx', 'x/toolbag.css.ts']), []);
});

test('the same name in different directories passes', () => {
    assert.deepEqual(findCaseOnlyNameCollisions(['a/Foo.ts', 'b/foo.ts']), []);
});

test('directories that differ only by case count as one directory', () => {
    assert.deepEqual(findCaseOnlyNameCollisions(['src/Foo/bar.ts', 'src/foo/Bar.tsx']), [
        ['src/Foo/bar.ts', 'src/foo/Bar.tsx'],
    ]);
});

test('root-level files are compared, and dotfiles keep their name as the stem', () => {
    assert.deepEqual(findCaseOnlyNameCollisions(['Foo.md', 'foo.txt']), [['Foo.md', 'foo.txt']]);
    assert.deepEqual(findCaseOnlyNameCollisions(['.eslintrc', '.eslintrc.cjs']), []);
    assert.deepEqual(findCaseOnlyNameCollisions(['README', 'readme.md']), [
        ['README', 'readme.md'],
    ]);
});

test('non-ASCII names are compared by case too', () => {
    assert.deepEqual(findCaseOnlyNameCollisions(['café/Á.ts', 'café/á.tsx']), [
        ['café/Á.ts', 'café/á.tsx'],
    ]);
});

test('nameWithoutLastExtension removes only the last extension', () => {
    assert.equal(nameWithoutLastExtension('a.b.c'), 'a.b');
    assert.equal(nameWithoutLastExtension('ToolBag.css.ts'), 'ToolBag.css');
    assert.equal(nameWithoutLastExtension('.eslintrc'), '.eslintrc');
    assert.equal(nameWithoutLastExtension('.eslintrc.cjs'), '.eslintrc');
    assert.equal(nameWithoutLastExtension('Makefile'), 'Makefile');
});

test('the whole-path check is kept for what the name rule does not see', () => {
    // Stems exactly equal ("a"), so only the whole-path check finds this.
    assert.deepEqual(checkCaseInsensitivePathCollisions(['src/a.TS', 'src/a.ts']), [
        ['src/a.TS', 'src/a.ts'],
    ]);
    assert.deepEqual(findCaseOnlyNameCollisions(['src/a.TS', 'src/a.ts']), []);
    // Both checks find this one.
    assert.deepEqual(checkCaseInsensitivePathCollisions(['src/A.ts', 'src/a.ts']), [
        ['src/A.ts', 'src/a.ts'],
    ]);
    assert.deepEqual(findCaseOnlyNameCollisions(['src/A.ts', 'src/a.ts']), [
        ['src/A.ts', 'src/a.ts'],
    ]);
});

// End to end: the script itself, run in a fresh repository. Every file pair
// below differs in its full name, so it can exist on a case-insensitive
// filesystem too.

// Inside a git hook GIT_DIR, GIT_INDEX_FILE and GIT_WORK_TREE point at the
// outer repository; without this, git in the fixture would read its index.
function cleanEnv() {
    const env = { ...process.env };
    delete env.GIT_DIR;
    delete env.GIT_INDEX_FILE;
    delete env.GIT_WORK_TREE;
    return env;
}

function makeRepo(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicate-paths-guard-'));
    const env = cleanEnv();
    const git = (...args) => {
        const res = spawnSync('git', args, { cwd: dir, env, encoding: 'utf8' });
        assert.equal(res.status, 0, `git ${args.join(' ')}: ${res.stderr}`);
    };
    git('init', '-q');
    for (const [relativePath, content] of Object.entries(files)) {
        const fullPath = path.join(dir, relativePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
    }
    git('add', '-A');
    return { dir, env };
}

function runGuard(files) {
    const { dir, env } = makeRepo(files);
    try {
        return spawnSync('node', [scriptPath], { cwd: dir, env, encoding: 'utf8' });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test('the script fails on toolbag.ts beside ToolBag.tsx and names both', () => {
    const res = runGuard({
        'toolbag/ToolBag.tsx': 'export default function ToolBag() { return null; }\n',
        'toolbag/toolbag.ts': 'export const entries = [];\n',
    });
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stderr, /differ only by case once the last extension is removed/);
    assert.match(res.stderr, /toolbag\/ToolBag\.tsx {2}<-> {2}toolbag\/toolbag\.ts/);
    assert.match(res.stdout, /No case-insensitive file path collisions found/);
});

test('the script passes on styles beside a component and one stem with two extensions', () => {
    const res = runGuard({
        'toolbag/ToolBag.tsx': 'export default function ToolBag() { return null; }\n',
        'toolbag/ToolBag.css.ts': 'export const root = "toolbag";\n',
        'index.ts': 'export {};\n',
        'index.css': 'body { margin: 0; }\n',
    });
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.match(res.stdout, /No case-only file name collisions found/);
    assert.match(res.stdout, /No case-insensitive file path collisions found/);
    assert.match(res.stdout, /No duplicate absolute route path literals found/);
});

test('the script reads non-ASCII paths unquoted (git ls-files -z)', () => {
    // Plain `git ls-files` prints these as "caf\303\251/\303\201.ts" and
    // "caf\303\251/\303\241.tsx", which no longer collide once lowercased.
    const res = runGuard({
        'café/Á.ts': 'export const a = 1;\n',
        'café/á.tsx': 'export const b = 2;\n',
    });
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stderr, /café\/Á\.ts {2}<-> {2}café\/á\.tsx/);
});
