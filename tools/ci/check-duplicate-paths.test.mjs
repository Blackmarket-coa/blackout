import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
    checkCaseInsensitivePathCollisions,
    findCaseOnlyDirectoryCollisions,
    findCaseOnlyNameCollisions,
    findNameAgainstStemCollisions,
    nameWithoutLastExtension,
} from './duplicate-paths-rules.mjs';

// The script runs the scan whenever it is loaded, so this file imports only
// the rules module and runs the script as a child process.
const scriptPath = fileURLToPath(new URL('./check-duplicate-paths.mjs', import.meta.url));
const rulesPath = fileURLToPath(new URL('./duplicate-paths-rules.mjs', import.meta.url));

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

test('a name that equals a sibling stem ignoring case fails; the exact name passes', () => {
    // `./Foo.css` is stat'd as written first: Foo.css.ts on Linux, foo.css on
    // macOS and Windows. The stems (Foo.css, foo) and the whole paths differ,
    // so neither older check sees the pair.
    const pair = ['x/Foo.css.ts', 'x/foo.css'];
    assert.deepEqual(findNameAgainstStemCollisions(pair), [['x/Foo.css.ts', 'x/foo.css']]);
    assert.deepEqual(findCaseOnlyNameCollisions(pair), []);
    assert.deepEqual(checkCaseInsensitivePathCollisions(pair), []);
    // The exact name wins on every filesystem.
    assert.deepEqual(findNameAgainstStemCollisions(['x/Foo.css.ts', 'x/Foo.css']), []);
    // A sibling without an extension against a stem: `./A` finds `a` only
    // where case does not matter.
    assert.deepEqual(findNameAgainstStemCollisions(['x/A.ts', 'x/a']), [['x/A.ts', 'x/a']]);
    assert.deepEqual(findNameAgainstStemCollisions(['x/a.ts', 'x/a']), []);
    // Root-level files compare without a `./` prefix; directories compare
    // ignoring case; different directories do not collide.
    assert.deepEqual(findNameAgainstStemCollisions(['Foo.css.ts', 'foo.css']), [
        ['Foo.css.ts', 'foo.css'],
    ]);
    assert.deepEqual(findNameAgainstStemCollisions(['src/Foo/bar.css.ts', 'src/foo/Bar.css']), [
        ['src/Foo/bar.css.ts', 'src/foo/Bar.css'],
    ]);
    assert.deepEqual(findNameAgainstStemCollisions(['a/Foo.css.ts', 'b/foo.css']), []);
    // Two files without extensions are check 1's: not reported here again.
    assert.deepEqual(findNameAgainstStemCollisions(['x/A', 'x/a']), []);
    // Unrelated neighbours, and the real client layout (index.css beside
    // colors.css.ts), give nothing.
    assert.deepEqual(
        findNameAgainstStemCollisions(['src/index.css', 'src/colors.css.ts', 'src/config.css.ts']),
        []
    );
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

test('directories whose paths differ only by case fail, whatever their files are called', () => {
    // The files collide under no other check (x against y), so without this
    // one the pair passes while a case-insensitive checkout merges the two
    // directories.
    const pair = ['src/Foo/x.ts', 'src/foo/y.ts'];
    assert.deepEqual(findCaseOnlyDirectoryCollisions(pair), [['src/Foo', 'src/foo']]);
    assert.deepEqual(checkCaseInsensitivePathCollisions(pair), []);
    assert.deepEqual(findCaseOnlyNameCollisions(pair), []);
    assert.deepEqual(findNameAgainstStemCollisions(pair), []);
    // One spelling, many files: nothing. Root files have no directory.
    assert.deepEqual(findCaseOnlyDirectoryCollisions(['src/foo/x.ts', 'src/foo/y.ts']), []);
    assert.deepEqual(findCaseOnlyDirectoryCollisions(['Foo.md', 'foo.txt', 'a/b.ts']), []);
    // Different names are different directories everywhere.
    assert.deepEqual(findCaseOnlyDirectoryCollisions(['a/Foo.ts', 'b/foo.ts']), []);
    // Each level that differs is its own group, spellings sorted.
    assert.deepEqual(findCaseOnlyDirectoryCollisions(['a/B/c/x.ts', 'a/b/C/y.ts']), [
        ['a/B', 'a/b'],
        ['a/B/c', 'a/b/C'],
    ]);
    // Three spellings make one group.
    assert.deepEqual(findCaseOnlyDirectoryCollisions(['Lib/a.ts', 'lib/b.ts', 'LIB/c.ts']), [
        ['LIB', 'Lib', 'lib'],
    ]);
    // Non-ASCII directory names are compared by case too.
    assert.deepEqual(findCaseOnlyDirectoryCollisions(['Café/a.ts', 'café/b.ts']), [
        ['Café', 'café'],
    ]);
});

// End to end: the script itself, run in a fresh repository. Every file pair
// below differs in its full name, so it can exist on a case-insensitive
// filesystem too, except where a test says otherwise and skips itself there.

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

test('the script fails on foo.css beside Foo.css.ts and names both', () => {
    const res = runGuard({
        'styles/Foo.css.ts': 'export const root = "foo";\n',
        'styles/foo.css': '.foo { color: red; }\n',
    });
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stderr, /equals a sibling's name without its last extension/);
    assert.match(res.stderr, /styles\/Foo\.css\.ts {2}<-> {2}styles\/foo\.css/);
    assert.match(res.stdout, /No case-only file name collisions found/);
    assert.match(res.stdout, /No case-insensitive file path collisions found/);
});

test('the script runs when called through a symlinked path', () => {
    // import.meta.url has symlinks resolved and process.argv[1] does not, so
    // a main-module guard that compares the two as given skips the scan and
    // exits 0 when the script is reached through a symlink (/tmp on macOS is
    // one). The script has no such guard; this keeps it that way.
    const { dir, env } = makeRepo({
        'toolbag/ToolBag.tsx': 'export default function ToolBag() { return null; }\n',
        'toolbag/toolbag.ts': 'export const entries = [];\n',
    });
    const linkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicate-paths-link-'));
    try {
        const link = path.join(linkRoot, 'ci');
        fs.symlinkSync(path.dirname(scriptPath), link, 'junction');
        const viaLink = path.join(link, path.basename(scriptPath));
        assert.notEqual(fs.realpathSync(viaLink), viaLink);
        const res = spawnSync('node', [viaLink], { cwd: dir, env, encoding: 'utf8' });
        assert.equal(res.status, 1, res.stdout + res.stderr);
        assert.match(res.stderr, /toolbag\/ToolBag\.tsx {2}<-> {2}toolbag\/toolbag\.ts/);
    } finally {
        fs.rmSync(linkRoot, { recursive: true, force: true });
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('the script fails on src/Foo/ beside src/foo/ and names both directories', (t) => {
    const { dir, env } = makeRepo({
        'src/Foo/x.ts': 'export const x = 1;\n',
        'src/foo/y.ts': 'export const y = 2;\n',
    });
    try {
        // On a case-insensitive filesystem the two directories are one, so
        // git tracks src/Foo/y.ts and the fixture does not exist as written.
        if (fs.existsSync(path.join(dir, 'src/Foo/y.ts'))) {
            t.skip('case-insensitive filesystem: the fixture cannot exist here');
            return;
        }
        const res = spawnSync('node', [scriptPath], { cwd: dir, env, encoding: 'utf8' });
        assert.equal(res.status, 1, res.stdout + res.stderr);
        assert.match(res.stderr, /Directory paths that differ only by case/);
        assert.match(res.stderr, /src\/Foo\/ {2}<-> {2}src\/foo\//);
        // No other check sees the pair.
        assert.match(res.stdout, /No case-insensitive file path collisions found/);
        assert.match(res.stdout, /No case-only file name collisions found/);
        assert.match(res.stdout, /No file name equals a sibling name without its last extension/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('the script scans when preloaded with --import, whatever process.argv[1] names', () => {
    // `node --import <script> <missing>` evaluates the script before node
    // reports the missing main module, with process.argv[1] naming a file
    // that does not exist. A main-module guard has no right answer there;
    // the script asks no such question and scans, so the pair fails it.
    const { dir, env } = makeRepo({
        'toolbag/ToolBag.tsx': 'export default function ToolBag() { return null; }\n',
        'toolbag/toolbag.ts': 'export const entries = [];\n',
    });
    try {
        const missing = path.join(dir, 'does-not-exist.mjs');
        assert.equal(fs.existsSync(missing), false);
        const res = spawnSync('node', ['--import', scriptPath, missing], {
            cwd: dir,
            env,
            encoding: 'utf8',
        });
        assert.equal(res.status, 1, res.stdout + res.stderr);
        assert.match(res.stderr, /toolbag\/ToolBag\.tsx {2}<-> {2}toolbag\/toolbag\.ts/);
        // The scan ended the process before node got to the missing module.
        assert.doesNotMatch(res.stdout + res.stderr, /ERR_MODULE_NOT_FOUND/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('importing the rules module runs nothing, whatever process.argv[1] names', () => {
    // A process that imports the rules (the test runner, with a glob left
    // unexpanded in process.argv[1], is one) must not be ended by them. The
    // fixture holds the tool-bag pair, so a scan would fail and say so.
    const { dir, env } = makeRepo({
        'toolbag/ToolBag.tsx': 'export default function ToolBag() { return null; }\n',
        'toolbag/toolbag.ts': 'export const entries = [];\n',
    });
    try {
        // No main script at all.
        const imported = spawnSync(
            'node',
            [
                '--input-type=module',
                '-e',
                `const m = await import(${JSON.stringify(pathToFileURL(rulesPath).href)});` +
                    "console.log(Object.keys(m).sort().join(','));",
            ],
            { cwd: dir, env, encoding: 'utf8' }
        );
        assert.equal(imported.status, 0, imported.stdout + imported.stderr);
        assert.equal(imported.stderr, '');
        assert.match(
            imported.stdout,
            /^checkCaseInsensitivePathCollisions,.*findCaseOnlyNameCollisions/
        );
        assert.doesNotMatch(imported.stdout, /collisions found|No case/);
        // A main module that does not exist: only node's own error.
        const missing = path.join(dir, 'does-not-exist.mjs');
        const preloaded = spawnSync('node', ['--import', rulesPath, missing], {
            cwd: dir,
            env,
            encoding: 'utf8',
        });
        assert.notEqual(preloaded.status, 0);
        assert.match(preloaded.stderr, /ERR_MODULE_NOT_FOUND/);
        assert.doesNotMatch(preloaded.stdout + preloaded.stderr, /❌|✅/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
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
    assert.match(res.stdout, /No file name equals a sibling name without its last extension/);
    assert.match(res.stdout, /No directory paths that differ only by case found/);
    assert.match(res.stdout, /No duplicate absolute route path literals found/);
});

test('the script passes on Foo.css beside Foo.css.ts (the exact name)', () => {
    const res = runGuard({
        'styles/Foo.css.ts': 'export const root = "foo";\n',
        'styles/Foo.css': '.foo { color: red; }\n',
    });
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.match(res.stdout, /No file name equals a sibling name without its last extension/);
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
