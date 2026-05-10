# Secrets Manager Migration Runbook

Foundation milestone deliverable mandated by
[`AGGRESSIVE_OPERATIONS_GUIDE.md` §2.3 and §7.2](../AGGRESSIVE_OPERATIONS_GUIDE.md).

This runbook covers the consolidation of secrets across the BMC stack into a
single chosen secrets manager. The current state is distributed: secrets live
in docker-compose environment files, FBM backend configuration, Blackout
deploy artifacts, and a handful of one-off locations. The target state is a
single manager with documented access scopes and a rotation policy
([`../operations/secrets_rotation_break_glass.md`](../operations/secrets_rotation_break_glass.md))
in operation.

---

## 0) Decision: which manager

The guide names three options in §2.3. Pick one before starting; the migration
procedure differs per option.

| Option | When to pick | Trade-off |
|---|---|---|
| **HashiCorp Vault** | Operational capacity to run it; preference for strong access control + audit logging | Higher operational overhead; another stateful service on the primary host or co-located peer |
| **Infisical** | Preference for managed UX; free tier is sufficient at current scale | Self-hosted control traded for managed convenience |
| **SOPS-encrypted directory** | Lightweight fallback; team is comfortable with encrypted-files-in-Git workflow | No central audit log; rotation is more manual |

Record the choice in [`../operations/SPOF_MAP.md`](../operations/SPOF_MAP.md)
row 7 once made.

### Decision recorded — 2026-05-10

**Chosen: SOPS + age** (the third option above), for these reasons:

- **Smallest attack surface.** No long-lived secret service to harden,
  patch, or expose. Encryption-at-rest in the repo, decryption requires
  possession of an age private key on the host. A poorly-operated Vault
  is less secure than a hard-to-misuse SOPS+age setup.
- **Solo-dev capacity passes the §3 filter.** Zero operational overhead
  beyond `sops` CLI invocations. No additional service to back up,
  monitor, or rotate seal keys for.
- **Bus-factor.** Multi-recipient encryption (maintainer + co-maintainer
  + deploy host) gives every encrypted file three independent decryptors
  without sharing a single key.
- **Audit-log gap is acceptable** at current scale: git history is the
  rotation log, and the AI-driven security workflow already covers the
  broader audit surface. Revisit if the platform scales past the
  Foundation milestone capacity profile.

OSS adoption — both [SOPS](https://github.com/getsops/sops) (Apache-2.0)
and [age](https://github.com/FiloSottile/age) (BSD-3-Clause) are adopted
without modification. Upstream releases are pinned via the standard
`apt` / Homebrew / asdf flows on the deploy host; no in-repo package
mirror is required.

Repo state landed alongside this decision:

- `.sops.yaml` at the repo root with `creation_rules` matching
  `deploy/secrets/*.sops.{env,yaml,yml,json}`. Recipient public keys
  are placeholders until §2.C key-generation completes.
- `deploy/secrets/README.md` documenting layout, read/edit/add
  workflow, and the deploy-side decryption path.
- `.gitignore` updated to allow `*.sops.env` files alongside the
  existing `.env*` block.

---

## 1) Preflight inventory

Before any move happens, build the inventory of what exists. Do not migrate
anything until the inventory is complete; partial migration produces
double-source-of-truth bugs that are expensive to find.

### 1.1 Inventory by location

- [ ] `deploy/docker/production/.env` and any `.env.*` siblings on the
      primary host. Capture every key, not the values.
- [ ] `deploy/docker/production/docker-compose.yml` and any `compose.override.*`.
      Look for `environment:` blocks and `secrets:` blocks.
- [ ] `infra/single-server-baseline/.env*` files.
- [ ] FBM backend config: env vars and `medusa-config.js` (in the FBM repo).
- [ ] Blackout server config: `apps/blackout-server/` env files and any
      `apps/blackout-server/docs/blackout-ops-runbook.md`-referenced sources.
- [ ] CI secrets: GitHub Actions `secrets:` and `vars:` for both repos.
- [ ] Cloudflare Tunnel credentials: `deploy/docker/production/.cloudflared/**/credentials.json`.
- [ ] Synapse signing keys: `infra/single-server-baseline/synapse/` (typically
      a `*.signing.key` in the data volume).
- [ ] coturn shared secret: synapse and turn must agree.
- [ ] MinIO admin and access keys.
- [ ] Stellar API keys and account secrets.
- [ ] Stripe API keys (publishable + secret) for the ACH edge.
- [ ] OAuth provider client IDs and secrets for the five compat providers
      (Twitch, YouTube, Kick, Patreon, Streamlabs). See
      [`COMPAT_LAYER_CREDENTIAL_RECOVERY.md`](COMPAT_LAYER_CREDENTIAL_RECOVERY.md).
- [ ] Postgres passwords (FBM DB user + Synapse DB user).
- [ ] Redis password if set.
- [ ] AES-GCM keys at rest in the Blackout DB (simulcast destinations,
      OBS-WS passwords, Discord-shape webhook secrets). The data is encrypted;
      the *key* must move into the manager.
- [ ] Backblaze B2 application keys for backups.
- [ ] DNS provider API tokens.

### 1.2 Inventory output

Produce one table:

| Secret name | Current location(s) | Consumers | Rotation frequency | Notes |
|---|---|---|---|---|

Save the table to a draft `inventory.md` under
[`../operations/evidence/`](../operations/evidence/) for the migration
window. It is the source of truth for the migration; do not begin step 2
until the table is reviewed.

The current inventory is at
[`../operations/evidence/2026-05-10-secrets-manager-inventory.md`](../operations/evidence/2026-05-10-secrets-manager-inventory.md).
Refresh it before starting §2 if the env-var landscape has shifted (re-walk
the source list at the top of the inventory; diff against the table).

### 1.3 Bus-factor preflight

- [ ] [`../operations/CO_MAINTAINER_ONBOARDING.md`](../operations/CO_MAINTAINER_ONBOARDING.md)
      Rung 4 prerequisites met for whoever will hold ongoing scoped access.
- [ ] Break-glass policy
      ([`../operations/secrets_rotation_break_glass.md`](../operations/secrets_rotation_break_glass.md))
      reviewed by both maintainer and any co-maintainer.

---

## 2) Stand up the chosen manager

This step diverges per option.

### 2.A Vault

- [ ] Provision a Vault server (Docker container co-located on primary host;
      or a small dedicated VM).
- [ ] Initialise Vault and generate unseal keys. Distribute unseal keys per
      the break-glass policy; do not store all of them on the primary host.
- [ ] Configure the audit device (file backend at minimum; consider syslog
      export if SIEM exists later).
- [ ] Create an `kv-v2` mount at `secret/`.
- [ ] Define policies:
  - `bmc-app-read` for application reads, scoped to the paths the consumer
    needs.
  - `bmc-maintainer` for full read/write.
  - `bmc-comaintainer-r` for scoped read aligned with
    [`../operations/CO_MAINTAINER_ONBOARDING.md`](../operations/CO_MAINTAINER_ONBOARDING.md)
    Rung 4.
- [ ] Configure an authentication method: AppRole for app consumers,
      OIDC or hardware-token-backed userpass for humans.

### 2.B Infisical

- [ ] Sign up for the free tier or self-host Infisical per their docs.
- [ ] Create a project per environment (`bmc-production`, `bmc-staging`).
- [ ] Configure access groups aligned with the
      [`../operations/CO_MAINTAINER_ONBOARDING.md`](../operations/CO_MAINTAINER_ONBOARDING.md)
      rungs.
- [ ] Issue service tokens for the application consumers; rotate cadence per
      [`../operations/secrets_rotation_break_glass.md`](../operations/secrets_rotation_break_glass.md).

### 2.C SOPS-encrypted directory

- [ ] Choose key backend: age (recommended, simpler) or GPG.
- [ ] Generate keys: maintainer key, co-maintainer key, deploy key on primary
      host. Store the maintainer recovery key in the offsite vault.
- [ ] Add a `.sops.yaml` at the repo root specifying the recipients.
- [ ] Create the directory `deploy/secrets/` (gitignored except for the
      encrypted artifacts).
- [ ] Document `sops -d` invocation for human reads and the deploy-side
      decryption hook.

---

## 3) Migrate secrets

For each row in §1.2 inventory, move the secret into the manager. The order
matters: low-blast-radius secrets first, so you build confidence in the
manager before moving anything that would break ingress.

Recommended order:

1. Read-only API tokens for monitoring and alerting (lowest blast radius).
2. OAuth provider client secrets for the five compat providers.
3. AES-GCM at-rest keys (the *key*; the encrypted data stays in the DB).
4. Object storage credentials (MinIO admin + B2 backup keys).
5. Postgres and Redis passwords.
6. Synapse signing keys (high blast radius — federation depends on this).
7. Cloudflare Tunnel credentials (highest blast radius — sole ingress).

Per secret:

- [ ] Write the secret into the manager at its target path; verify read-back.
- [ ] Update the consumer to read from the manager (env-var injection,
      template render, app-side fetch — depends on the consumer).
- [ ] Deploy the consumer with the new wiring; confirm the consumer is
      operating on the manager-sourced value (do not assume; restart and
      verify).
- [ ] Once the consumer is confirmed live on the manager, remove the secret
      from its original location. Do not skip this step; leaving the
      original creates the double-source bug §1 warned about.
- [ ] Tick the row in the §1.2 inventory.

---

## 4) Validation

The migration is complete when:

- [ ] Every row in the §1.2 inventory has the manager as its sole source.
- [ ] `git grep` and `rg` across both repos and the primary host's compose
      files for the literal secret values returns nothing.
- [ ] Each consumer has been restarted at least once after the migration so
      no stale process is holding an old in-memory copy.
- [ ] [`../operations/secrets_rotation_break_glass.md`](../operations/secrets_rotation_break_glass.md)
      rotation cadence has been exercised on at least one secret end-to-end
      via the new manager.
- [ ] [`../operations/SPOF_MAP.md`](../operations/SPOF_MAP.md) row 7 is
      updated to name the chosen manager and set its current mitigation to
      "consolidated; rotation policy active".
- [ ] One bus-factor drill
      ([`../operations/BUS_FACTOR_DRILL_CADENCE.md`](../operations/BUS_FACTOR_DRILL_CADENCE.md))
      has exercised retrieving and using a secret through the manager. This
      can be combined with another drill operation (Synapse restart, etc).

---

## 5) Rollback

The migration is reversible per-secret. Until §4's "remove the secret from
its original location" step is taken, both sources exist; rollback is "keep
reading from the original."

Once originals are removed:

- [ ] Re-introduce the original location with a freshly rotated value (do
      not restore an old value from backup; rotate before re-introducing).
- [ ] Update the consumer to read from the original location.
- [ ] Document the rollback in
      [`../operations/evidence/`](../operations/evidence/) so the next
      attempt can avoid the same failure mode.

The manager itself is not torn down on rollback; it is left in place,
empty, so a second attempt does not have to redo §2.

---

## Cross-references

- [`../AGGRESSIVE_OPERATIONS_GUIDE.md` §2.3](../AGGRESSIVE_OPERATIONS_GUIDE.md) — secrets consolidation rationale
- [`../AGGRESSIVE_OPERATIONS_GUIDE.md` §7.2](../AGGRESSIVE_OPERATIONS_GUIDE.md) — runbook list
- [`../operations/SPOF_MAP.md`](../operations/SPOF_MAP.md) — secrets manager SPOF row
- [`../operations/secrets_rotation_break_glass.md`](../operations/secrets_rotation_break_glass.md) — ongoing rotation policy
- [`../operations/CO_MAINTAINER_ONBOARDING.md`](../operations/CO_MAINTAINER_ONBOARDING.md) — Rung 4 access scope
- [`COMPAT_LAYER_CREDENTIAL_RECOVERY.md`](COMPAT_LAYER_CREDENTIAL_RECOVERY.md) — depends on this manager being in place
