# Blackout Threat Model

This document is the authoritative top-level threat model for Blackout. It defines the adversary classes we defend against, the trust boundaries in the system, the assets we protect, and the residual risks we have explicitly accepted. Narrow per-feature threat models live alongside their features and are linked from §6.

Last updated: 2026-09-20 (coalition cross-posting: adversary A12, credential / inbound-reply / attribution assets and posture rows, residual risks R8–R9, release criterion 8). Previous: 2026-05-03 (deferral landings: ML-KEM-768 wired, WebAuthn verification wired, KT log persistence + Ed25519 witness wired)

---

## 1. System sketch

Blackout is a federated, end-to-end-encrypted communication platform built on the Matrix protocol with a LiveKit-based real-time media plane. The clients are a web app, a Tauri desktop app, and a React Native mobile app. The server side is a Synapse-derived homeserver, a Node API, a LiveKit SFU, and ancillary services (media repo, push gateway, OIDC).

```
┌──────────────────┐      E2EE (Megolm/Olm)        ┌───────────────────┐
│ Client (web /    │◀──────────────────────────────▶│ Other client      │
│ desktop / mobile)│   ciphertext relayed via       │ (any homeserver)  │
└────────┬─────────┘   Matrix federation            └───────────────────┘
         │
         │ TLS / Matrix CS API
         ▼
┌──────────────────┐    federation (HTTPS+sigs)    ┌───────────────────┐
│ Blackout         │◀──────────────────────────────▶│ Other homeservers │
│ homeserver       │                                └───────────────────┘
└────────┬─────────┘
         │ signaling (encrypted to_device events)
         ▼
┌──────────────────┐    DTLS-SRTP (+ SFrame E2EE)
│ LiveKit SFU      │◀──────────────────────────────▶ Clients (calls)
└──────────────────┘
```

## 2. Adversary classes

| #   | Adversary                                           | Capabilities                                                                                                                                                                                                                           | In scope?                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **Network observer**                                | Passive on-path between client and homeserver, or between homeservers                                                                                                                                                                  | Yes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| A2  | **Active network attacker**                         | MITM, downgrade, replay, BGP hijack                                                                                                                                                                                                    | Yes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| A3  | **Curious or coerced homeserver operator**          | Full plaintext access to anything the homeserver stores; can serve malicious clients/keys                                                                                                                                              | Yes — bounded by E2EE                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| A4  | **Compromised SFU operator**                        | Full plaintext access to media that reaches the SFU                                                                                                                                                                                    | Yes — addressed by per-call media E2EE (§A1 of improvements plan)                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| A5  | **Compromised federated peer homeserver**           | Full plaintext for users on that server; can issue fake events on their behalf                                                                                                                                                         | Yes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| A6  | **Malicious room/community member**                 | Legitimate credential, abuses APIs, fishes for IDOR, governance manipulation                                                                                                                                                           | Yes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| A7  | **Attacker with stolen device or active session**   | Can read everything that device can                                                                                                                                                                                                    | Partial — addressed by per-device verification + session revocation                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| A8  | **Malicious dependency / supply-chain attacker**    | Publishes a poisoned npm/cargo package                                                                                                                                                                                                 | Yes — addressed by SBOM gating, lockfile pinning, signed releases                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| A9  | **Nation-state with future quantum compute**        | Records ciphertext today, decrypts later ("harvest now, decrypt later")                                                                                                                                                                | Partial — PQ hybrid for deaddrops shipped (X25519 + ML-KEM-768); Megolm PQ deferred to upstream                                                                                                                                                                                                                                                                                                                                                                                                          |
| A10 | **Physical adversary with device seizure**          | Cold-boot attacks, forensic imaging                                                                                                                                                                                                    | Out of scope (delegated to OS keystore / FDE)                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| A11 | **Malicious client build**                          | Distributes a tampered client                                                                                                                                                                                                          | Yes — addressed by signed releases + reproducible builds                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| A12 | **Hostile external replier / third-party platform** | Anyone who can reply on Discord, Bluesky or Mastodon to a post the coalition made: can flood the receiver, post abusive or doxxing text, replay or forge origin ids. The platform itself can change terms, rate-limit or revoke access | Yes — reply text lands `pending` and is invisible until coalition moderation (`ingestExternalActivity` in `packages/api/src/services/coalitionSync.ts`); at most 500 replies per post, further arrivals refused; origin-id dedupe; a reply is refused unless it arrived on the platform the post went out on; purged on the retention windows; a platform moderator can remove any reply via the takedown route; platform terms and rate limits are recorded per platform in `COALITION_PLATFORM_POLICY` |

## 3. Trust boundaries

1. **Client ↔ homeserver.** TLS-protected. Homeserver is _trusted for routing/availability_, _untrusted for content_ (Megolm/Olm protect plaintext).
2. **Homeserver ↔ federated homeserver.** Server-signed events, perspective key servers. Each homeserver is trusted only for its own users.
3. **Client ↔ LiveKit SFU.** DTLS-SRTP today; SFU sees plaintext frames. After improvement A1: SFrame E2EE removes SFU from the trust boundary for media confidentiality.
4. **Client ↔ OIDC IdP.** IdP is trusted for identity assertion; tokens are short-lived.
5. **Build pipeline ↔ release artifact.** Signed (cosign) artifacts move the trust boundary from "whatever was downloaded" to "whatever was signed by the build attestation key."
6. **Per-device boundary.** Each device has its own Megolm/Olm keys; cross-signing binds them under one user identity. Verification (SAS/QR) extends the boundary to a peer device.

## 4. Assets

-   Message plaintext (DMs, channels, threads, replies).
-   Call and townhall media plaintext.
-   Attachment plaintext.
-   Deaddrop payload plaintext.
-   Cross-signing master / self-signing / user-signing keys.
-   Per-device Megolm/Olm keys and key backup.
-   OIDC refresh tokens.
-   Governance vote ballots and tally inputs.
-   Federation peer keys and trust state.
-   Audit logs (tamper-evident).
-   User social graph and metadata (room membership, presence, who-talks-to-whom, timing).
-   Coalition platform credentials (shared and member connection secrets).
-   Inbound external replies (third-party text held for moderation).
-   Campaign attribution and engagement counters.

## 5. Per-asset confidentiality / integrity / availability posture

| Asset                             | Confidentiality                                                                                                                                                                                      | Integrity                                                                                                             | Availability                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Message plaintext                 | E2EE (Megolm)                                                                                                                                                                                        | Megolm AEAD + Matrix event sigs                                                                                       | Best-effort across federation                                                        |
| Call/townhall media               | **TLS-only today**; SFrame E2EE planned (A1)                                                                                                                                                         | DTLS + planned SFrame                                                                                                 | SFU HA                                                                               |
| Attachments                       | E2EE (Matrix file encryption)                                                                                                                                                                        | AES-GCM AEAD                                                                                                          | Media repo HA                                                                        |
| Deaddrops                         | E2EE (X25519+AES-GCM v1, X25519+ML-KEM-768+AES-GCM v2 hybrid)                                                                                                                                        | AES-GCM AEAD                                                                                                          | Server-opaque storage                                                                |
| Cross-signing keys                | SSSS (passphrase/recovery key)                                                                                                                                                                       | Self-signed                                                                                                           | User-managed                                                                         |
| OIDC tokens                       | TLS + secure storage                                                                                                                                                                                 | OIDC sigs                                                                                                             | IdP HA                                                                               |
| Governance ballots                | Tamper-evident ledger                                                                                                                                                                                | Hash chain + sigs                                                                                                     | HA                                                                                   |
| Federation peer keys              | TLS                                                                                                                                                                                                  | Server signing keys                                                                                                   | Perspective key servers                                                              |
| Audit logs                        | Operator only                                                                                                                                                                                        | WORM                                                                                                                  | HA                                                                                   |
| Metadata (graph/timing)           | **Visible to homeserver(s)** by Matrix protocol design                                                                                                                                               | n/a                                                                                                                   | n/a                                                                                  |
| Coalition platform credentials    | AES-256-GCM envelope (`packages/api/src/services/secretBox.ts`), key held by the server operator, AAD-bound to the connection, decrypted only to post or poll — **server-side encryption, not E2EE** | AEAD tag + AAD binding                                                                                                | Key rotation by key id (`LINKED_ACCOUNT_ENCRYPTION_KEYS`), per-connection revocation |
| Inbound external replies          | Public by origin; held `pending` until moderated; not served for stopped coalitions                                                                                                                  | Origin-id dedupe, platform must match the post, author clamped to 120 and content to 2000 chars, 500 replies per post | Purged by the retention sweep: pending 30 days, rejected 30 days, approved 365 days  |
| Attribution / engagement counters | Counts only, no visitor identifier; the signed ref names campaign, channel and sharer only                                                                                                           | HMAC-SHA256 ref with 90-day expiry                                                                                    | n/a                                                                                  |

## 6. Linked narrow threat models

-   Governance: `docs/blackout-governance-threat-model.md`
-   Townhall / SFU: `docs/security/townhall-threat-model-refresh-cadence.md`, `docs/security/townhall-security-review-signoff.md`
-   Epic-level STRIDE template: `docs/security/epic_security_review.md`
-   Production network exposure: `deploy/docker/production/NETWORK_SECURITY_REVIEW.md`
-   Steganography (free-tier): `docs/security/free-tier-steganography-text-emoji.md`
-   Element Call / SFU architecture: `docs/architecture/ELEMENT_CALL_SFU_RTC_ARCHITECTURE.md`

When you build a new feature that crosses a trust boundary or introduces a new asset, copy `docs/security/epic_security_review.md` as a starting STRIDE template and link the result here.

### 6a. Third-party plugin code (marketplace installs)

**Asset**: code-bearing plugins purchased through a connected marketplace
(`code_plugin` artifact kind under `packages/api/src/routes/creator.ts`,
loaded by `apps/blackout-client/src/app/features/monetization/install/pluginInstaller.ts`).

**Threats**:

-   **Spoofing/Tampering**: a man-in-the-middle or compromised CDN serves a
    malicious bundle. Mitigated by requiring an Ed25519/HMAC signature
    envelope (`PluginSignatureEnvelope` in
    `packages/blackout-protocol/src/plugins/index.ts`) covering both the
    canonical manifest hash and the bundle SHA-256. The blackout client
    refuses to install if the key id is not on its pinned keyset
    (`apps/blackout-client/src/app/features/monetization/install/pluginSignature.ts`).
-   **Privilege escalation inside the host**: plugin code attempts to read
    cookies, call host APIs, or open Matrix sessions. Mitigated by hosting
    bundles in a `sandbox="allow-scripts"` `srcdoc` iframe with no host
    DOM or storage access; all interaction goes through a typed postMessage
    RPC bridge gated by capabilities declared in the manifest
    (`PluginCapability`, enforced in
    `apps/blackout-client/src/app/features/monetization/install/sandbox/PluginSandboxHost.ts`).
-   **Lateral movement to other plugins / users**: each sandbox instance is
    scoped to a single plugin id and does not share state with other
    plugins. Capability denials are logged and surfaced in
    Settings → Plugins so the user can revoke.
-   **Repudiation / persistence after revocation**: when an entitlement is
    revoked or a `creator.account.suspended` lifecycle event arrives, the
    installer unregisters the dynamic plugin and the sandbox iframe is
    destroyed. The signed bundle is not retained outside the active
    install record.
-   **Embedded checkout iframe abuse**: the marketplace embed iframe runs
    with `sandbox="allow-scripts allow-forms allow-same-origin
allow-top-navigation-by-user-activation"`; the host only relays
    `checkout.completed` / `checkout.cancelled` postMessage events whose
    origin matches the redirect URL, and refuses any other origin or
    payload shape.

**Residual risk**: a plugin that is granted broad capabilities (e.g.
`message.compose`) can still misbehave within those capabilities. The
manifest is shown to the user before install and capabilities can be
revoked from Settings → Plugins. Production releases must pin the
freeblackmarket publishing keyset at build time (no
`BLACKOUT_PLUGIN_DEV_HMAC` shortcut).

## 7. Accepted residual risks

These risks are known and accepted, with the rationale recorded so reviewers do not need to re-litigate them.

| ID  | Risk                                                                            | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Revisit when                                 |
| --- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| R1  | Homeserver sees who-talks-to-whom and when                                      | Inherent to Matrix protocol; sealed-sender-style metadata privacy is out of scope today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Sealed sender lands in upstream Matrix       |
| R2  | SFU sees plaintext A/V media                                                    | Mitigated: per-call media E2EE (symmetric for 1:1/group, broadcast sender keys for townhalls) is negotiated by default in `CallProvider.tsx`. Status surfaced by `EncryptionBadge`. Operators must keep the matrixRTC-capable SDK installed.                                                                                                                                                                                                                                                                                                                                                                         | New SFU deployment patterns                  |
| R3  | Megolm not post-quantum                                                         | Awaiting upstream Matrix PQ work. Deaddrop v2 hybrid (X25519 + ML-KEM-768) shipped end-to-end via `@noble/post-quantum`; v2 envelopes encrypt and decrypt round-trip in-tree (see `docs/security/deaddrop-pq-hybrid.md`).                                                                                                                                                                                                                                                                                                                                                                                            | Upstream PQ Megolm draft published           |
| R4  | OIDC IdP compromise = identity compromise                                       | Standard OIDC trust model; mitigated by short token TTLs and per-device keys. Native passkey support shipped — challenges, storage, clientDataJSON validation, and cryptographic attestation/assertion verification (delegated to `@simplewebauthn/server`) plus sign-counter monotonicity for clone detection. Gated behind `WEBAUTHN_ENABLED=1`. See `docs/security/webauthn-passkeys.md`.                                                                                                                                                                                                                         | Mandatory passkey enrolment policy           |
| R5  | Client supply chain                                                             | Mitigated by lockfile pinning, SBOM (SPDX + Docker embedded), Sigstore-keyless cosign signatures pinned to the release workflow identity, and an RFC 6962-compatible key-transparency log (`docs/security/key-transparency.md`) so clients can detect homeserver-side key substitution. Persistence is operator-configurable (in-memory default; JSON-file via `KT_LOG_FILE`). Ed25519 witness signatures over each Signed Tree Head ship (operator-configurable via `KT_WITNESS_ED25519_SEED`); pure-function `verifySignedTreeHead` so clients and auditors run identical code.                                    | Federated witness gossip                     |
| R6  | Physical device seizure                                                         | Delegated to OS keystore + FDE                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | New mobile threat model                      |
| R7  | DoS via federation amplification                                                | Rate limits + per-peer reputation; not a confidentiality risk                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | New federation abuse incidents               |
| R8  | Coalition platform credentials are decryptable by the server operator           | The server must post and poll on the coalition's behalf, so the secret has to be usable server-side (`packages/api/src/services/secretBox.ts`); this is server-side encryption, not E2EE. Mitigated by AAD binding to the connection, revocation on disconnect (`revokeMemberLinks` in `packages/api/src/services/coalitionConnectionCustody.ts`), key rotation by key id, and the connection-custody rules: a member's personal credential is never driven unattended (`packages/api/src/services/coalitionAutoCrosspost.ts`), and a personal Discord token is refused outright at connection time as self-botting. | A client-held-credential design exists       |
| R9  | Platform terms and rate limits in `COALITION_PLATFORM_POLICY` are point-in-time | Each platform's terms, automation basis, agreement state and rate limit are recorded with a cited source and a `reviewedOn` date (`packages/core/src/coalition/coalitionNetwork.ts`, last reviewed 2026-09-20). `platformCanAutomate` refuses a platform whose required agreement is unsigned, so a stale record fails closed rather than posting under terms nobody accepted.                                                                                                                                                                                                                                       | Each adapter change or platform terms update |

## 8. Release-blocking criteria (summary)

A release is blocked unless:

1. No open Critical/High vulnerabilities in application code, deps, or container images.
2. Authorization test suite passes 100% for new/changed endpoints.
3. Governance integrity tests pass (anti-replay, anti-double-cast, deterministic tally).
4. Federation trust controls validated (peer auth, sig verification, key rotation).
5. Security telemetry verified in staging.
6. This document updated for any feature that crosses a trust boundary or adds a new asset.
7. Security sign-off recorded and linked to the release artifact.
8. Inbound external sync (`BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED`) is not enabled on a deployment where the external-reply retention sweep is disabled (`BLACKOUT_COALITION_EXTERNAL_RETENTION_SWEEP=0`).

(Full criteria in `docs/security/epic_security_review.md` §5.)

## 9. Reporting

Security issues: see `SECURITY.md` for disclosure process.
