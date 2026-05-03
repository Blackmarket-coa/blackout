# Release artifact signing & verification

Blackout release artifacts and container images are signed at build time
with [Sigstore cosign](https://docs.sigstore.dev) keyless OIDC. Signatures
are produced by the `Release` GitHub Actions workflow
(`.github/workflows/release.yml`) using the workflow's ambient OIDC
token, so there is no long-lived signing key to leak.

## What is signed

| Artifact | Signature format | Lives at |
|----------|-----------------|----------|
| Web bundle, desktop builds, mobile builds | Detached `.sig`, `.pem`, `.bundle` | GitHub release assets |
| Docker image (multi-arch) | Embedded Sigstore attestation + cosign signature | OCI registry under the same digest |

Each release also produces a CycloneDX/SPDX SBOM (`sbom.spdx.json` for
the web bundle; embedded for the Docker image via
`docker/build-push-action` `sbom: true`).

## Verifying a release artifact

```sh
# Detached signature for a file artifact:
tools/release/verify-release.sh \
  ./blackout-web-vX.Y.Z/dist/index.html \
  ./blackout-web-vX.Y.Z/dist/index.html.sig \
  ./blackout-web-vX.Y.Z/dist/index.html.pem

# Docker image:
tools/release/verify-release.sh image ghcr.io/blackmarket-coa/blackout:vX.Y.Z
```

Both commands will fail if the signature does not chain back to the
expected workflow identity (`Blackmarket-coa/blackout` →
`.github/workflows/release.yml`) issued by the GitHub Actions OIDC
provider, so a maliciously-published binary cannot pass verification
even if it is co-located with a forged signature.

## Why keyless

- No private signing key to manage, rotate, or recover from compromise.
- Verification pins the *workflow path* and *repository* — an attacker
  who steals a token would still need to publish from the correct
  workflow in the correct repo to forge a valid signature.
- Transparent: every signature is recorded in the public Rekor
  transparency log (https://search.sigstore.dev) within seconds of
  signing, so retroactive tampering is detectable.

## Operator playbook

1. Pull the image **by digest**, not by tag, after verifying.
2. Wire `cosign verify` into your deployment admission controller (e.g.
   Kyverno, Connaisseur, or Sigstore Policy Controller).
3. If verification ever fails on a tag you previously trusted, treat
   it as a supply-chain incident and follow `SECURITY.md`.

## Related controls

- `THREAT_MODEL.md` §7 R5 — supply chain residual risk.
- `apps/blackout-server/release/train/checklist.md` — release-train
  checklist, gated on SBOM presence.
