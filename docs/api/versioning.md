# API Versioning Policy

## Canonical namespace

- Canonical external API namespace is **`/v1/*`**.
- Legacy alias **`/api/*`** is compatibility-only and emits deprecation headers.
- `/api/*` removal target date: **2026-08-31**.

## Contract source of truth

- Shared contract definitions live in `packages/contracts/src/api-contract.ts`.
- Client and backend implementations must import endpoint constants/types from `@blackout/contracts`.

## Domain coverage (minimum for v1)

- Auth (`/v1/auth/*`)
- Channels (`/v1/channels/*`)
- Messages (`/v1/messages/*`)
- Governance (`/v1/governance/*`)
- Federation (`/v1/federation/*`)

## Change rules

### Non-breaking changes

- Adding optional request fields.
- Adding new endpoints under `/v1/*`.
- Adding response fields that clients can safely ignore.

### Breaking changes

- Removing or renaming endpoints.
- Removing response fields or changing field types.
- Changing required request payload shape.

Breaking changes require introducing `/v2/*` and maintaining a deprecation window for `/v1/*`.

## Deprecation mechanics

When a deprecated path is used, backend must emit:

- `Deprecation: true`
- `Sunset: <RFC3339 date>`
- `Link: <versioning policy doc>`

Deprecation usage should be observable in logs/telemetry and reviewed weekly until removal.
