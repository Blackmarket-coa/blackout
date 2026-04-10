# Blackout Release Checklist Template

Release: `X.Y.Z-blackout.N`  
Date: `YYYY-MM-DD`  
Owner: `@maintainer`

## Upstream Diff Review

- [ ] Compared against upstream tag/commit:
- [ ] Documented intentionally diverged patches:
- [ ] Verified protocol-compatibility impact summary:

## CVE Review

- [ ] Reviewed upstream and distro CVE feeds relevant to this release train:
- [ ] Recorded CVE disposition (`fixed`, `not-applicable`, `deferred`) with rationale:
- [ ] Confirmed security release notes updates:

## Backport Plan

- [ ] Listed required backports and source commits/PRs:
- [ ] Applied and tested backports:
- [ ] Captured rollback/mitigation notes for deferred backports:

## Divergence Risk Markers

- [ ] If this PR changes risky paths (`auth/signing/federation`), add checked marker entries:
  - [x] `synapse/federation/...` - rationale + interoperability check link
  - [x] `synapse/api/auth/...` - rationale + interoperability check link

## Image Provenance & SBOM

- [ ] Updated `release/train/image_provenance.json`
- [ ] `source_revision` and `upstream_base_revision` set
- [ ] `sbom_artifact_uri` and `provenance_artifact_uri` point to published artifacts

## Sign-off

- [ ] Release owner approval
- [ ] Security owner approval
- [ ] Ops owner approval
