# Blackout Release Checklist

Release: `1.98.0-blackout.1`  
Date: `2026-03-19`  
Owner: `@blackout-release-eng`

## Upstream Diff Review

- [x] Compared against upstream tag/commit: `v1.98.0` baseline.
- [x] Documented intentionally diverged patches: release-train gating, image lifecycle, hosting profiles, managed readiness helpers, and opt-in monetization foundations.
- [x] Verified protocol-compatibility impact summary: `/_matrix/client/versions` compatibility smoke exercised in release gate.

## CVE Review

- [x] Reviewed upstream and distro CVE feeds relevant to this release train.
- [x] Recorded CVE disposition (`fixed`, `not-applicable`, `deferred`) with rationale in release notes and security intake docs.
- [x] Confirmed security release notes updates for RC1.

## Backport Plan

- [x] Listed required backports and source commits/PRs.
- [x] Applied and tested backports (none required for RC1 beyond baseline sync).
- [x] Captured rollback/mitigation notes for deferred backports in operator notes.

## Divergence Risk Markers

- [x] If this PR changes risky paths (`auth/signing/federation`), add checked marker entries:
  - [x] `synapse/rest/client/versions.py` - fork capability surface changed; compatibility smoke required.
  - [x] `synapse/util/release_train.py` - release policy gate logic changed; guardrail tests required.

## Image Provenance & SBOM

- [x] Updated `release/train/image_provenance.json`
- [x] `source_revision` and `upstream_base_revision` set
- [x] `sbom_artifact_uri` and `provenance_artifact_uri` point to published or pre-publish artifact locations

## Sign-off

- [x] Release owner approval
- [x] Security owner approval
- [x] Ops owner approval
