#!/usr/bin/env bash
# Verify a Blackout release artifact and Docker image signed with cosign keyless.
#
# Usage:
#   scripts/verify-release.sh <artifact-path> <signature-path> <certificate-path>
#   scripts/verify-release.sh image ghcr.io/blackmarket-coa/blackout:vX.Y.Z
#
# The signing workflow uses Sigstore keyless OIDC, so verification pins the
# expected GitHub repository and workflow as the issuer.

set -euo pipefail

EXPECTED_REPO="https://github.com/Blackmarket-coa/blackout"
EXPECTED_WORKFLOW=".github/workflows/release.yml"
ISSUER="https://token.actions.githubusercontent.com"

require() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "ERROR: $1 is required but not installed." >&2
        exit 2
    fi
}

require cosign

mode="${1:-}"
shift || true

case "$mode" in
    image)
        ref="${1:?image reference required}"
        cosign verify "$ref" \
            --certificate-identity-regexp "${EXPECTED_REPO}/${EXPECTED_WORKFLOW}@" \
            --certificate-oidc-issuer "$ISSUER"
        ;;
    *)
        artifact="$mode"
        signature="${1:?signature path required}"
        certificate="${2:?certificate path required}"
        cosign verify-blob \
            --signature "$signature" \
            --certificate "$certificate" \
            --certificate-identity-regexp "${EXPECTED_REPO}/${EXPECTED_WORKFLOW}@" \
            --certificate-oidc-issuer "$ISSUER" \
            "$artifact"
        ;;
esac

echo "OK"
