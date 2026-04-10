# Week 3 packaging/image lifecycle completion report — 2026-03-19

## Completed items

1. Added fork-owned image lifecycle workflow:
   - `.github/workflows/blackout-image-lifecycle.yml`
   - publishes `blackout-server:<version>` + `:stable` on tags, `:canary` on main/develop.
2. Added required image metadata labels:
   - source revision,
   - upstream base revision,
   - build timestamp.
3. Added provenance/SBOM artifact pointer enforcement:
   - `release/train/image_provenance.json` added.
   - `synapse/util/release_train.py` now validates provenance file + required fields.
4. Added managed integration smoke in CI with ephemeral Postgres/Redis services:
   - `scripts-dev/blackout/managed_readiness_integration_smoke.py`
   - release-train gate workflow now runs it.
5. Added docs and template updates:
   - `docs/ops/blackout_image_lifecycle.md`
   - checklist template and release checklist include image provenance/SBOM section.

## Remaining blockers

1. Signing/promotion automation for stable releases is still basic (no multi-step promotion approval gate).
2. Provenance/SBOM URIs are enforced for presence but not yet verified for reachability.
3. No full end-to-end deployment job that boots blackout-server container and performs live health checks in CI.

## Risks

1. Placeholder provenance values may pass structural checks if not replaced before release cut.
2. CI service-container readiness timing could cause intermittent false negatives in managed smoke.
3. Cross-registry publishing policy (if DockerHub mirror required) is not yet codified for blackout images.

## Exact next prompt

```text
Given the product fork execution plan and current repo state:
1) Implement release promotion hardening:
   - gated promotion flow from :canary to :stable with manual approval
   - immutable tag retention policy checks
2) Enforce provenance quality:
   - validate SBOM/provenance URIs are reachable and immutable
   - require signed attestation metadata for tagged releases
3) Add end-to-end container startup smoke in CI:
   - boot blackout-server image
   - verify /health and /_matrix/client/versions compatibility
4) Add/update tests and docs.
5) Produce a completion report with completed items, blockers, risks, and next prompt.
```
