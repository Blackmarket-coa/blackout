#!/usr/bin/env node
// Parses every YAML file under .github/ISSUE_TEMPLATE/ and
// .github/DISCUSSION_TEMPLATE/ and fails (exit 1) if any file does not load.
// Parse-only: it does not enforce the GitHub issue-form schema, just that the
// documents are well-formed YAML so the New issue / New discussion chooser
// keeps working. Kept dependency-light — js-yaml is installed by the workflow.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// js-yaml is installed into an isolated prefix (see the workflow) to avoid
// `npm install` tripping over the pnpm workspace root. A CJS require honors
// NODE_PATH, so resolve it that way rather than via a bare ESM import.
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

const DIRS = ['.github/ISSUE_TEMPLATE', '.github/DISCUSSION_TEMPLATE'];

/** All *.yml / *.yaml files in a directory; empty if the directory is absent. */
function yamlFilesIn(dir) {
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
    return entries
        .filter((e) => e.isFile() && /\.ya?ml$/i.test(e.name))
        .map((e) => join(dir, e.name))
        .sort();
}

const files = DIRS.flatMap(yamlFilesIn);
const failures = [];

for (const file of files) {
    try {
        yaml.load(readFileSync(file, 'utf8'));
        console.log(`ok   ${file}`);
    } catch (err) {
        failures.push({ file, message: err.message });
        console.error(`FAIL ${file}\n     ${err.message.replace(/\n/g, '\n     ')}`);
    }
}

if (files.length === 0) {
    console.log('No issue/discussion template YAML found — nothing to validate.');
}

if (failures.length > 0) {
    console.error(`\n${failures.length} template file(s) failed to parse.`);
    process.exit(1);
}

console.log(`\nAll ${files.length} template file(s) parsed cleanly.`);
