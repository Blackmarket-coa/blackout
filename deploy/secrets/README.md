# Encrypted secrets directory

This directory holds the BMC-stack secrets after the migration
covered by
[`../../docs/runbooks/SECRETS_MANAGER_MIGRATION.md`](../../docs/runbooks/SECRETS_MANAGER_MIGRATION.md).

The chosen manager is **SOPS + age**, picked for the security and
capacity profile in the runbook §0 decision row (recorded
2026-05-10). Both [SOPS](https://github.com/getsops/sops) (Apache-2.0)
and [age](https://github.com/FiloSottile/age) (BSD-3-Clause) are OSS
adopted with no modification.

## Layout (post-migration)

```
deploy/secrets/
├── README.md                     ← this file (committed)
├── primary.sops.env              ← single-server-baseline secrets (committed, encrypted)
├── ci.sops.env                   ← GitHub-Actions-mirrored secrets (committed, encrypted)
├── mobile-signing.sops.yaml      ← Android/iOS signing material (committed, encrypted)
└── recovery.sops.yaml            ← rarely-rotation key recovery copies (committed, encrypted)
```

Rules:

- All checked-in files match `*.sops.env` or `*.sops.{yaml,yml,json}` —
  enforced by the `creation_rules` in `../../.sops.yaml`.
- Plaintext `.env` files in this directory are `.gitignore`-d (see the
  global `.gitignore` rule for `.env*`).
- Decryption requires possession of one of the three age recipient
  keys listed in `../../.sops.yaml`.

## Read a secret

```sh
# Decrypt and emit on stdout (does not write plaintext to disk):
sops -d deploy/secrets/primary.sops.env

# Pull a single key from a structured secret:
sops -d --extract '["secrets"]["JWT_SECRET"]' deploy/secrets/primary.sops.yaml
```

## Edit a secret

```sh
# Opens $EDITOR with the decrypted contents; re-encrypts on save.
sops deploy/secrets/primary.sops.env
```

## Add a new secret file

```sh
# Initial create (relies on creation_rules in ../../.sops.yaml):
sops deploy/secrets/new-thing.sops.env
# Then commit the encrypted file.
```

## Deploy-side decryption

The deploy host holds the third recipient's private key at
`/etc/sops/age/keys.txt` (mode 0400, root-only). The systemd
units in
[`../../infra/single-server-baseline/systemd/`](../../infra/single-server-baseline/systemd/)
invoke `sops -d` to materialise plaintext env files at start time
into a tmpfs mount, never to disk. See the runbook §2.C and §3 for
the exact wiring.

## Key-generation ceremony

The runbook §2.C ceremony is automated by
[`scripts/sops-key-ceremony.sh`](scripts/sops-key-ceremony.sh). Private
keys never enter the repo: identities are written to a `.gitignore`-d
output dir at mode `0400`, and only the public keys are wired into
`../../.sops.yaml`.

```sh
# 1. Prove the encrypt/decrypt pipeline with throwaway keys (no repo changes):
deploy/secrets/scripts/sops-key-ceremony.sh --dry-run

# 2. Run the real ceremony on a trusted machine (generates the three
#    identities, patches .sops.yaml placeholders with their public keys):
deploy/secrets/scripts/sops-key-ceremony.sh generate

# 3. Distribute the three identities out-of-band (offsite vault /
#    co-maintainer / deploy host), delete the local copies, then review and
#    commit the .sops.yaml diff.

# Confirm a held identity can read an encrypted file:
deploy/secrets/scripts/sops-key-ceremony.sh verify <identity> deploy/secrets/primary.sops.env
```

## Bootstrap state

Until the key-generation ceremony in the runbook §2.C is completed,
`../../.sops.yaml` carries placeholder recipients and **no encrypted
files exist in this directory**. The first real commit here happens
after the ceremony.
