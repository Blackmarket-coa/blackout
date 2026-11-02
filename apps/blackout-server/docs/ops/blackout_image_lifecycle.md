# Blackout image lifecycle ownership (Week 3)

> **2026-11-02.** The workflow this page describes,
> `.github/workflows/blackout-image-lifecycle.yml`, and the Dockerfile it
> built, `services/blackout-server/Dockerfile`, were removed with the Railway
> template in `42f68f2`; the operator chose removal over fixing the template. That
> workflow sat under `apps/blackout-server/.github/workflows/`, which GitHub
> does not read, so it was never registered as a workflow of this repository
> and never ran in it. Nor could this version of the file have run anywhere: it
> does not parse as YAML (line 23 starts a heredoc's body at column 1 inside a
> `run: |` block, which ends the block), and it was byte-identical from the
> fork's arrival here in `e0f3065e31` (2026-04-10) to its removal. Whether an
> earlier version ran in the fork's former repository was not checked.
> `release/train/image_provenance.json` names this workflow as the builder of
> the RC1 image; that is the RC1 record's statement, not evidence of a run, and
> the file and the release gate's checks of it remain. The fork image built
> today is `blackout-synapse:stable`, from `docker/Dockerfile`, by
> `infra/single-server-baseline/deploy.sh`.

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
