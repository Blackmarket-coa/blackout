# Blackout image lifecycle ownership (Week 3)

This document defines fork-owned image publishing strategy for `blackout-server`.

## Tag strategy

Release tags are derived from version policy `X.Y.Z-blackout.N`.

Required published tags:

1. `blackout-server:<version>` (immutable release)
2. `blackout-server:stable` (latest promoted stable)
3. `blackout-server:canary` (latest develop/mainline build)

## CI hook behavior

* On version tags (`refs/tags/v*`): publish immutable `:<version>` and update `:stable`.
* On `develop`/`main` branch: publish/update `:canary`.

## Required image metadata labels

Images MUST include:

* `org.opencontainers.image.revision` (source commit SHA)
* `org.opencontainers.image.version` (fork version)
* `io.blackout.upstream_base_revision` (tracked upstream commit/tag)
* `org.opencontainers.image.created` (UTC build timestamp)

## SBOM/provenance pointers

For each release train, maintain:

* `release/train/image_provenance.json`

Required fields:

* `source_revision`
* `upstream_base_revision`
* `build_timestamp_utc`
* `sbom_artifact_uri`
* `provenance_artifact_uri`

Release gate enforces file existence and required fields.

## Rollback

* Repoint deployment from `:stable` to previous immutable `:<version>`.
* Keep prior SBOM/provenance pointers in release artifacts for audit continuity.
