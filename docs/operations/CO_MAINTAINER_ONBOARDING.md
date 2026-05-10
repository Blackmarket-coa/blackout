# Co-Maintainer Onboarding

This document is the maintainer-level onboarding ladder. It is distinct from
[`operator_onboarding_pack.md`](operator_onboarding_pack.md), which covers
per-shift operator readiness; this ladder is for someone who will eventually
deploy production changes, hold credentials, and act for the maintainer when
the maintainer is unavailable.

Mandated by [`AGGRESSIVE_OPERATIONS_GUIDE.md` §7.2](../AGGRESSIVE_OPERATIONS_GUIDE.md)
as a Foundation milestone deliverable. The Foundation exit criteria require
that one co-maintainer has been onboarded with at least read access and has
demonstrated the ability to follow runbooks during the bus-factor drill.

## Access ladder

Grants are scoped narrowly and unlocked in order. Do not skip rungs. Each
rung has a corresponding revocation step recorded in the offboarding section
below; the revocation pre-state is what the access ladder defines.

### Rung 1 — Repository read

- [ ] Add to the `Blackmarket-coa` GitHub organisation as a member with
      read access to `blackout`, `free-black-market`, and any infrastructure
      repos referenced from this guide.
- [ ] Confirm 2FA is enabled on the GitHub account (the org enforces it; this
      is a verification step, not a grant).
- [ ] Share read-only links to this document, [`SPOF_MAP.md`](SPOF_MAP.md),
      [`oncall_escalation_tree.md`](oncall_escalation_tree.md),
      [`operator_onboarding_pack.md`](operator_onboarding_pack.md), and
      [`AGGRESSIVE_OPERATIONS_GUIDE.md`](../AGGRESSIVE_OPERATIONS_GUIDE.md).
- [ ] Walk through [`AGGRESSIVE_OPERATIONS_GUIDE.md` §1–§5](../AGGRESSIVE_OPERATIONS_GUIDE.md)
      together. Confirm understanding of the two-layer architecture, the wedge,
      the prioritization filter, and the milestone structure.

### Rung 2 — Repository write (scoped)

- [ ] Promote to write access on `blackout` and `free-black-market`.
- [ ] Branch protection on `develop` / `main` requires PR + maintainer review;
      this is the operative limit on what scoped write means in practice.
- [ ] Confirm signed-commit posture: hardware key configured, signed commits
      enabled in Git config.
- [ ] Pair on three PRs end-to-end (review, address comments, merge) before
      moving to the next rung.

### Rung 3 — Deploy access on the primary server

- [ ] SSH key issued for the primary HP DL360 host. Key is hardware-backed
      where possible (YubiKey + ed25519-sk).
- [ ] Account on the host has membership in the deploy group only; root is
      reserved for the maintainer until Rung 5.
- [ ] Walk through [`infra/single-server-baseline/RUNBOOK.md`](../../infra/single-server-baseline/RUNBOOK.md)
      together with the new co-maintainer driving and the maintainer reviewing.
- [ ] Practice a no-op deploy: pull, build, and roll a non-user-facing change
      end-to-end.

### Rung 4 — Secrets manager scope

- [ ] Issue a scoped credential in the chosen secrets manager (Vault / Infisical / SOPS).
      Scope: read-only for compat-layer credentials and Postgres connection strings.
      Write scope is held back until Rung 5.
- [ ] Walk through [`runbooks/SECRETS_MANAGER_MIGRATION.md`](../runbooks/SECRETS_MANAGER_MIGRATION.md)
      and [`secrets_rotation_break_glass.md`](secrets_rotation_break_glass.md).
- [ ] Practice fetching one secret and using it in a staging context.

### Rung 5 — External dashboard read access

- [ ] Stripe dashboard: read-only role.
- [ ] Stellar account dashboard: read-only access to the BMC settlement account.
- [ ] Cloudflare: read-only role on DNS, Tunnels, and Zero Trust.
- [ ] Backblaze B2: read-only on the backups bucket only.
- [ ] MinIO admin console: read-only.
- [ ] Confirm 2FA on each external account.

### Rung 6 — Full autonomy

- [ ] Promote to maintainer-equivalent on GitHub, deploy, and secrets manager.
- [ ] Add to the on-call rotation per
      [`oncall_escalation_tree.md`](oncall_escalation_tree.md).
- [ ] Co-sign at least one bus-factor drill per
      [`BUS_FACTOR_DRILL_CADENCE.md`](BUS_FACTOR_DRILL_CADENCE.md).
- [ ] Listed in [`SPOF_MAP.md`](SPOF_MAP.md) row 8 as a mitigation.

Per [`AGGRESSIVE_OPERATIONS_GUIDE.md` §5](../AGGRESSIVE_OPERATIONS_GUIDE.md),
full autonomy is a Density milestone exit criterion: at least one co-maintainer
ships production work without maintainer review on routine items.

## "If the maintainer is unavailable" decision tree

Use this when the maintainer is unreachable for an extended period (illness,
travel, incapacitation). The goal is to keep the substrate operating for the
duration of the unavailability without making decisions that the maintainer
would reverse.

1. **Stay operable; do not ship strategy.** Operational fixes (restarts,
   rollbacks, credential rotations, runbook execution) are in scope. Strategic
   changes (milestone exits, governance petitions, new vendor terms,
   architecture changes) are not.
2. **Escalation order.**
   - Page the on-call co-maintainer (if Rung 6 has been reached).
   - Consult [`oncall_escalation_tree.md`](oncall_escalation_tree.md) for the
     incident type.
   - For the SPOF rows in [`SPOF_MAP.md`](SPOF_MAP.md), the owning runbook is
     authoritative.
3. **Break-glass credentials** are governed by
   [`secrets_rotation_break_glass.md`](secrets_rotation_break_glass.md).
   Two-person approval is required; the second person is the passphrase manager
   emergency-access delegate named in the maintainer's identity-hardening
   record.
4. **Communications.** Coalition partners and vendors are informed in
   milestone-anchored terms, not calendar-anchored terms, per §6.4 of the
   guide. "Maintainer is temporarily unavailable; operations are continuing per
   runbook" is the right register.
5. **Reversibility bias.** If a decision is hard to reverse, defer it. The
   maintainer can always make an irreversible decision later; a co-maintainer
   acting under unavailability cannot un-make one.

## Offboarding (revocation)

Revoke in reverse order of grant. Each revocation is a checkbox so the
audit trail is explicit.

- [ ] Remove from on-call rotation.
- [ ] Revoke external dashboard access (Stripe, Stellar, Cloudflare, B2, MinIO).
- [ ] Revoke secrets-manager credentials; rotate any secrets the departing
      co-maintainer held read access to.
- [ ] Revoke deploy SSH key on the primary host.
- [ ] Demote GitHub access to read-only, then remove from the org.
- [ ] Update [`SPOF_MAP.md`](SPOF_MAP.md) row 8 to reflect the change.
- [ ] Schedule a bus-factor drill within thirty days of offboarding to confirm
      that no tribal knowledge has departed with the co-maintainer.

## Cross-references

- [`AGGRESSIVE_OPERATIONS_GUIDE.md` §7](../AGGRESSIVE_OPERATIONS_GUIDE.md) — bus-factor mitigation
- [`SPOF_MAP.md`](SPOF_MAP.md) — what the maintainer SPOF mitigates against
- [`BUS_FACTOR_DRILL_CADENCE.md`](BUS_FACTOR_DRILL_CADENCE.md) — drill validates onboarding
- [`operator_onboarding_pack.md`](operator_onboarding_pack.md) — per-shift onboarding (different scope)
- [`oncall_escalation_tree.md`](oncall_escalation_tree.md) — incident escalation
- [`secrets_rotation_break_glass.md`](secrets_rotation_break_glass.md) — break-glass policy
