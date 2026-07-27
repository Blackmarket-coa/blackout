#!/usr/bin/env node
/**
 * SOPS recipient guard (audit finding M14).
 *
 * `.sops.yaml` ships with PLACEHOLDER age recipients (`age1placeholder…`) until
 * the key-generation ceremony in docs/runbooks/SECRETS_MANAGER_MIGRATION.md is
 * performed by a human with offline keys. Placeholders are harmless on their
 * own, but they become a real footgun the moment an encrypted secret is
 * committed: the file would be "encrypted" to keys nobody actually holds
 * (undecryptable), or — worse — someone assumes secrets are protected when the
 * ceremony never ran.
 *
 * This guard fails CI if BOTH are true:
 *   1. `.sops.yaml` still contains a placeholder recipient, AND
 *   2. at least one file matching the SOPS creation_rules exists on disk
 *      (i.e. someone started committing encrypted secrets).
 *
 * It does NOT fail merely because placeholders exist with no secrets yet —
 * that is the expected pre-ceremony state. Completing the ceremony (replacing
 * the placeholders with real age public keys) is a human task and cannot be
 * automated here.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SOPS_CONFIG = '.sops.yaml';
const SECRETS_DIR = 'deploy/secrets';
const PLACEHOLDER_RE = /age1placeholder/i;
// Files SOPS is configured to encrypt (mirror of the .sops.yaml creation_rules).
const SECRET_FILE_RE = /\.sops\.(env|ya?ml|json)$/i;

if (!existsSync(SOPS_CONFIG)) {
    console.log('check-sops-recipients: no .sops.yaml — nothing to verify.');
    process.exit(0);
}

const sopsConfig = readFileSync(SOPS_CONFIG, 'utf8');
const hasPlaceholders = PLACEHOLDER_RE.test(sopsConfig);

const walk = (dir) => {
    const out = [];
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir)) {
        const abs = join(dir, entry);
        if (statSync(abs).isDirectory()) out.push(...walk(abs));
        else out.push(abs);
    }
    return out;
};

const encryptedSecrets = walk(SECRETS_DIR).filter((f) => SECRET_FILE_RE.test(f));

if (!hasPlaceholders) {
    console.log('check-sops-recipients: OK — real age recipients configured.');
    process.exit(0);
}

if (encryptedSecrets.length === 0) {
    console.log(
        'check-sops-recipients: OK — placeholders present but no encrypted secrets committed yet ' +
            '(expected pre-ceremony state). Run the age key ceremony before committing any *.sops.* file.'
    );
    process.exit(0);
}

console.error(
    'check-sops-recipients: FAILED — encrypted secret files exist while .sops.yaml still'
);
console.error('  uses placeholder age recipients. These files are encrypted to keys nobody holds.');
console.error('  Complete the ceremony in docs/runbooks/SECRETS_MANAGER_MIGRATION.md (replace the');
console.error(
    '  age1placeholder… recipients with real age public keys), then re-encrypt. Offending:'
);
for (const f of encryptedSecrets) console.error(`    - ${f}`);
process.exit(1);
