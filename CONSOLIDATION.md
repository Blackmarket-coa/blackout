# Consolidation Status — Blackout

Part of the 2026-08-28 seven-repo BMC consolidation review. The canonical review — audit
verdicts, decisions, and the ordered roadmap — is `docs/REPO_CONSOLIDATION_REVIEW.md` in
`Blackmarket-coa/free-black-market`. This file records what lands here.

## This repo's verdicts

- **Interface layer confirmed** per `docs/AGGRESSIVE_OPERATIONS_GUIDE.md`: Blackout is the
  communication/governance surface; FBM is the economic substrate. Coliseum, Coalition, and
  Creator Hub stay nested here.
- **Identity (decision D4, W2)**: the ecosystem IdP is Matrix OIDC/MAS — the surface already
  inherited in the Synapse fork and wired in the backend compose templates. The bespoke JWT
  account system in `packages/api` (auth routes, refresh rotation, WebAuthn) retires behind it
  over W2; the account-number ↔ MXID mapping in `packages/core/src/auth/accountNumber.ts` is the
  migration seam. "MXID is canonical" stops being aspirational once this lands.
- **Money layer (decision D1, W1 — highest-hazard item in the review)**: Coalition Credits and
  tips already delegate movement to FBM correctly (read-only projection; `captureTip` +
  `fbm_order_id`). Two things still move money locally and get absorbed in W1: the direct Stripe
  integration for creator/canopy subscriptions (route through FBM checkout + entitlements — the
  provider seam exists and is path-pinned by tests), and `channel_points_ledger` (either becomes
  an FBM closed-loop rail or is explicitly declared non-monetary engagement state; the
  derived-balance pattern itself is sound and worth keeping).
- **Geospatial home (decision D5, W5)**: the MapLibre + PostGIS + martin + geocoder-proxy stack
  here is the ecosystem's one spatial service. W5 exposes it as an API for FBM (which retires its
  haversine helpers and ZIP3 lookup) and any future logistics work.
- **Queued hygiene**: collapse the three client shells (`apps/blackout-client` is the live one;
  `apps/blackout-gov` and `legacy/blackout-web` are migration residue), reconcile the four
  governance implementations (core / protocol / sdk / api) onto one, and fix the stale root
  README paths + `ELEMENT_WEB_PORT` residue in `Dockerfile.blackout`.

## Explicitly outside consolidation scope

- **BO-1** (megolm/key-backup decryption failures, `KNOWN_ISSUES.md`) stays the top operations
  priority. The suppressed-log counters now have a consumer; the underlying defect is still open.
  Consolidation work must not displace it.
- The legal/compliance launch gates tracked in `MARKETPLACE_AUDIT.md` §9 are unchanged.
