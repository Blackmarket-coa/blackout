#!/usr/bin/env bash
#
# SOPS + age key-generation ceremony helper.
#
# Automates runbook §2.C
# (docs/runbooks/SECRETS_MANAGER_MIGRATION.md): generate the three age
# recipients (maintainer / co-maintainer / deploy host), wire their PUBLIC
# keys into the repo's .sops.yaml, and verify the encrypt/decrypt round-trip.
#
# SECURITY CONTRACT
#   - PRIVATE KEYS NEVER ENTER THE REPO. Identities are written to an output
#     directory (default ./.sops-ceremony-out) that .gitignore blocks, with
#     mode 0400. Distribute them out-of-band per the runbook and delete the
#     local copies once custodied.
#   - Only the PUBLIC keys (age1...) are written into .sops.yaml, which IS
#     committed. Public keys are not secret.
#
# USAGE
#   deploy/secrets/scripts/sops-key-ceremony.sh --dry-run
#       Prove the pipeline with ephemeral throwaway keys in a temp dir, then
#       tear everything down. Touches no repo state. Safe to run anywhere.
#
#   deploy/secrets/scripts/sops-key-ceremony.sh generate
#       The real ceremony. Generates the three identities into OUT_DIR and
#       patches .sops.yaml placeholders with the resulting public keys.
#       Run this on a trusted, offline-capable machine.
#
#   deploy/secrets/scripts/sops-key-ceremony.sh verify <identity-file> <encrypted-file>
#       Confirm a held identity can decrypt an already-encrypted SOPS file.
#
# ENV
#   OUT_DIR   Where identities are written by `generate` (default
#             ./.sops-ceremony-out, gitignored).
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SOPS_CONFIG="${REPO_ROOT}/.sops.yaml"
OUT_DIR="${OUT_DIR:-${REPO_ROOT}/.sops-ceremony-out}"

# Placeholder tokens in .sops.yaml, in recipient order.
PLACEHOLDERS=(
  "age1placeholder0maintainerpublickeyreplaceaftersopskeyceremonyxxxxxxxxxxxx"
  "age1placeholder1comaintainerpublickeyreplaceaftersopskeyceremonyxxxxxxxxxx"
  "age1placeholder2deployhostpublickeyreplaceaftersopskeyceremonyxxxxxxxxxxxx"
)
ROLES=("maintainer" "co-maintainer" "deploy-host")

die() { printf 'error: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

require_age() {
  have age-keygen || die "age-keygen not found. Install age (https://github.com/FiloSottile/age)."
}

# Generate one identity file (0400) and echo its public key on stdout.
gen_identity() {
  local out="$1"
  ( umask 077; age-keygen -o "$out" 2>/dev/null )
  chmod 0400 "$out"
  age-keygen -y "$out"
}

cmd_generate() {
  require_age
  grep -q "${PLACEHOLDERS[0]}" "$SOPS_CONFIG" \
    || die ".sops.yaml has no placeholder recipients — ceremony already run? Refusing to overwrite real keys."

  mkdir -p "$OUT_DIR"; chmod 0700 "$OUT_DIR"
  printf 'Generating three age identities into %s\n\n' "$OUT_DIR"

  local pubs=()
  for i in "${!ROLES[@]}"; do
    local role="${ROLES[$i]}"
    local idfile="${OUT_DIR}/${role}.agekey"
    local pub; pub="$(gen_identity "$idfile")"
    pubs+=("$pub")
    printf '  %-14s public=%s  identity=%s\n' "$role" "$pub" "$idfile"
  done

  cp "$SOPS_CONFIG" "${SOPS_CONFIG}.bak"
  for i in "${!PLACEHOLDERS[@]}"; do
    # Portable in-place sed (GNU + BSD) via a temp file.
    sed "s|${PLACEHOLDERS[$i]}|${pubs[$i]}|g" "$SOPS_CONFIG" > "${SOPS_CONFIG}.tmp"
    mv "${SOPS_CONFIG}.tmp" "$SOPS_CONFIG"
  done

  cat <<EOF

.sops.yaml wired with the three public keys (backup at ${SOPS_CONFIG}.bak).

NEXT STEPS (runbook §2.C / §3):
  1. Distribute identities OUT-OF-BAND, then delete the local copies in
     ${OUT_DIR}:
       - ${ROLES[0]}.agekey   -> offsite recovery vault (primary)
       - ${ROLES[1]}.agekey   -> co-maintainer (CO_MAINTAINER_ONBOARDING.md Rung 4)
       - ${ROLES[2]}.agekey   -> deploy host: /etc/sops/age/keys.txt, mode 0400, root-only
  2. Review the .sops.yaml diff, remove the .bak, and commit .sops.yaml.
  3. Create the first secret:  sops deploy/secrets/primary.sops.env
  4. Verify a non-deploy recipient can read it:
       SOPS_AGE_KEY_FILE=<identity> sops -d deploy/secrets/primary.sops.env

Run \`$0 --dry-run\` first if you want to see the round-trip before committing.
EOF
}

cmd_verify() {
  local idfile="${1:?usage: verify <identity-file> <encrypted-file>}"
  local enc="${2:?usage: verify <identity-file> <encrypted-file>}"
  have sops || die "sops not found; install it to verify a real encrypted file."
  SOPS_AGE_KEY_FILE="$idfile" sops -d "$enc" >/dev/null \
    && echo "OK: identity $idfile can decrypt $enc"
}

# Prove the multi-recipient pipeline end-to-end with throwaway keys.
# Prefers sops (the real tool); falls back to a pure-age round-trip when sops
# is unavailable so the core property — any single recipient decrypts
# independently — is still demonstrated.
cmd_dry_run() {
  require_age
  local tmp; tmp="$(mktemp -d)"
  # Expand $tmp now: the trap fires at script-exit scope where this local is gone.
  trap "rm -rf '$tmp'" EXIT
  printf 'Dry run in %s (ephemeral; auto-removed)\n\n' "$tmp"

  local id_a="$tmp/maintainer.agekey" id_b="$tmp/deploy.agekey"
  local pub_a pub_b
  pub_a="$(gen_identity "$id_a")"
  pub_b="$(gen_identity "$id_b")"
  printf '  recipient A (maintainer): %s\n  recipient B (deploy):     %s\n\n' "$pub_a" "$pub_b"

  local secret="$tmp/primary.env"
  printf 'JWT_SECRET=dry-run-not-a-real-secret-%s\n' "$RANDOM" > "$secret"

  if have sops; then
    printf 'Using sops (encrypt to both recipients, decrypt with each)\n'
    cat > "$tmp/.sops.yaml" <<EOF
creation_rules:
  - path_regex: \.env$
    encrypted_regex: '^.+$'
    age: >-
      ${pub_a},
      ${pub_b}
EOF
    ( cd "$tmp" && sops -e --config "$tmp/.sops.yaml" "$secret" > "$tmp/primary.sops.env" )
    SOPS_AGE_KEY_FILE="$id_a" sops -d "$tmp/primary.sops.env" >/dev/null && echo "  ✓ recipient A decrypts"
    SOPS_AGE_KEY_FILE="$id_b" sops -d "$tmp/primary.sops.env" >/dev/null && echo "  ✓ recipient B decrypts"
  else
    printf 'sops not installed — demonstrating the underlying age layer instead.\n'
    have age || die "neither sops nor age available."
    age -r "$pub_a" -r "$pub_b" -o "$tmp/cipher.age" "$secret"
    diff -q <(age -d -i "$id_a" "$tmp/cipher.age") "$secret" >/dev/null && echo "  ✓ recipient A decrypts independently"
    diff -q <(age -d -i "$id_b" "$tmp/cipher.age") "$secret" >/dev/null && echo "  ✓ recipient B decrypts independently"
  fi
  printf '\nDry run OK. Multi-recipient independent decryption verified.\n'
}

case "${1:-}" in
  --dry-run|dry-run) cmd_dry_run ;;
  generate)          cmd_generate ;;
  verify)            shift; cmd_verify "$@" ;;
  *) cat >&2 <<EOF
SOPS + age key-generation ceremony helper (runbook §2.C).

  $0 --dry-run                          prove the pipeline (no repo changes)
  $0 generate                           run the real ceremony + wire .sops.yaml
  $0 verify <identity> <encrypted>      confirm an identity can decrypt a file

See deploy/secrets/README.md and docs/runbooks/SECRETS_MANAGER_MIGRATION.md.
EOF
     exit 2 ;;
esac
