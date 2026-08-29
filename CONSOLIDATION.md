# Consolidation Status — Blackout

Part of the 2026-08-28 seven-repo BMC consolidation review. The canonical review — audit
verdicts, decisions, and the ordered roadmap — is `docs/REPO_CONSOLIDATION_REVIEW.md` in
`Blackmarket-coa/free-black-market`. This file records what lands here.

## This repo's verdicts

-   **Interface layer confirmed** per `docs/AGGRESSIVE_OPERATIONS_GUIDE.md`: Blackout is the
    communication/governance surface; FBM is the economic substrate. Coliseum, Coalition, and
    Creator Hub stay nested here.
-   **Identity (decision D4, W2)**: the ecosystem IdP is Matrix OIDC/MAS — the surface already
    inherited in the Synapse fork and wired in the backend compose templates. ~~The bespoke JWT
    account system retires behind it over W2~~ **W2 landed dark (2026-08-29)**: the deploy
    templates advertise MSC2965 + register the relying parties (FBM, blackout-api) in the MAS
    client registry; the API's native OIDC login (`/v1/auth/oidc/begin` + `/continue` +
    `/v1/auth/sign-out`) is filled in behind `BLACKOUT_OIDC_*` env (503 until set). Canonical
    contract + migration path: `docs/contracts/mas-identity.md` — the account-number ↔ MXID
    mapping in `packages/core/src/auth/accountNumber.ts` is the migration seam (syn2mas moves
    password hashes; the exchange flow survives the flip byte-identically). The local JWT +
    refresh pair, password login/registration, and WebAuthn retire on the ladder in that doc.
    **Blackmask verification note**: zero Blackmask references exist in this repo — the IdP role
    is MAS by construction, closing the charter item that Blackmask must never become an
    identity provider.
-   **Money layer (decision D1, W1 — highest-hazard item in the review)**: Coalition Credits and
    tips already delegate movement to FBM correctly (read-only projection; `captureTip` +
    `fbm_order_id`). ~~Two things still move money locally and get absorbed in W1~~ **W1b landed
    (2026-08-29)** — both are resolved:
    -   The direct Stripe/Lago rail is **deleted** (`stripeCheckout.ts`,
        `billingWebhookSignature.ts`, `/v1/subscriptions/portal` + `/webhooks/{lago,stripe}`,
        ~11 env vars). Creator subscriptions AND Canopy plans now delegate to FBM checkout with a
        metadata correlation echo; settled purchases loop back through the one marketplace webhook
        dispatcher. Contract: `docs/contracts/fbm-billing-consumer.md`. It was a pre-launch
        rewiring — no Stripe credentials or live subscriptions ever existed.
    -   **`channel_points_ledger` is DECLARED NON-MONETARY** (operator decision): per-channel
        engagement state like XP — creator-minted, earned in-channel, spent on redemptions, never
        purchasable, never convertible to CCR/USD or any FBM rail. The audit verified the schema
        has zero cents/CCR edges (mint only via self-channel grant, spend only via redeem), so the
        declaration required zero migration; the derived-balance pattern stays as-is. Any future
        purchasable-points product must be a NEW FBM-listed product, never a conversion of this
        ledger.
-   **Extension registry (decision D6, W3)**: the registry lives in FBM's catalog; Blackout is a
    consumer host. **W3 landed dark (2026-08-29)**: the shared extension manifest is Blackout's
    own `PluginManifest` (adopted as the cross-repo contract —
    `free-black-market/docs/contracts/extension-manifest.md`), and the real `freeblackmarket`
    provider now implements `issueSignedBundle` against FBM's registry read side
    (`GET /store/plugins/:slug` detail + versioned `/manifest`; the stored envelope is minted in
    this repo's wire format at publish, no translation). Marketplace version writes are
    SemVer-gated (`400 invalid_version`) with the same rule as FBM's registry. Registry reads
    need `FREEBLACKMARKET_PUBLISHABLE_KEY` (Medusa gates `/store/*`); the in-process stub keeps
    dev/CI serving. Deferred: the client's pinned dev-HMAC publishing key flips to FBM's
    published Ed25519 keys (`/.well-known/freeblackmarket-publishing-keys.json`) at release —
    operator item; `code_plugin` sandbox runtime remains pre-existing M19, not W3. Blackout's
    slots/panels model and FBM's author-side webhook hooks are complementary surfaces, not a
    conflict — no reconciliation needed.
-   **Geospatial home (decision D5, W5)**: the MapLibre + PostGIS + martin + geocoder-proxy stack
    here is the ecosystem's one spatial service. W5 exposes it as an API for FBM (which retires its
    haversine helpers and ZIP3 lookup) and any future logistics work.
-   **Queued hygiene**: collapse the three client shells (`apps/blackout-client` is the live one;
    `apps/blackout-gov` and `legacy/blackout-web` are migration residue), reconcile the four
    governance implementations (core / protocol / sdk / api) onto one, and fix the stale root
    README paths + `ELEMENT_WEB_PORT` residue in `Dockerfile.blackout`.

## Explicitly outside consolidation scope

-   **BO-1** (megolm/key-backup decryption failures, `KNOWN_ISSUES.md`) stays the top operations
    priority. The suppressed-log counters now have a consumer; the underlying defect is still open.
    Consolidation work must not displace it.
-   The legal/compliance launch gates tracked in `MARKETPLACE_AUDIT.md` §9 are unchanged.
