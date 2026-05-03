# Blackout Threat Model

This document is the authoritative top-level threat model for Blackout. It defines the adversary classes we defend against, the trust boundaries in the system, the assets we protect, and the residual risks we have explicitly accepted. Narrow per-feature threat models live alongside their features and are linked from §6.

Last updated: 2026-05-03

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

| # | Adversary | Capabilities | In scope? |
|---|-----------|--------------|-----------|
| A1 | **Network observer** | Passive on-path between client and homeserver, or between homeservers | Yes |
| A2 | **Active network attacker** | MITM, downgrade, replay, BGP hijack | Yes |
| A3 | **Curious or coerced homeserver operator** | Full plaintext access to anything the homeserver stores; can serve malicious clients/keys | Yes — bounded by E2EE |
| A4 | **Compromised SFU operator** | Full plaintext access to media that reaches the SFU | Yes — addressed by per-call media E2EE (§A1 of improvements plan) |
| A5 | **Compromised federated peer homeserver** | Full plaintext for users on that server; can issue fake events on their behalf | Yes |
| A6 | **Malicious room/community member** | Legitimate credential, abuses APIs, fishes for IDOR, governance manipulation | Yes |
| A7 | **Attacker with stolen device or active session** | Can read everything that device can | Partial — addressed by per-device verification + session revocation |
| A8 | **Malicious dependency / supply-chain attacker** | Publishes a poisoned npm/cargo package | Yes — addressed by SBOM gating, lockfile pinning, signed releases |
| A9 | **Nation-state with future quantum compute** | Records ciphertext today, decrypts later ("harvest now, decrypt later") | Partial — PQ hybrid for deaddrops planned; Megolm PQ deferred to upstream |
| A10 | **Physical adversary with device seizure** | Cold-boot attacks, forensic imaging | Out of scope (delegated to OS keystore / FDE) |
| A11 | **Malicious client build** | Distributes a tampered client | Yes — addressed by signed releases + reproducible builds |

## 3. Trust boundaries

1. **Client ↔ homeserver.** TLS-protected. Homeserver is *trusted for routing/availability*, *untrusted for content* (Megolm/Olm protect plaintext).
2. **Homeserver ↔ federated homeserver.** Server-signed events, perspective key servers. Each homeserver is trusted only for its own users.
3. **Client ↔ LiveKit SFU.** DTLS-SRTP today; SFU sees plaintext frames. After improvement A1: SFrame E2EE removes SFU from the trust boundary for media confidentiality.
4. **Client ↔ OIDC IdP.** IdP is trusted for identity assertion; tokens are short-lived.
5. **Build pipeline ↔ release artifact.** Signed (cosign) artifacts move the trust boundary from "whatever was downloaded" to "whatever was signed by the build attestation key."
6. **Per-device boundary.** Each device has its own Megolm/Olm keys; cross-signing binds them under one user identity. Verification (SAS/QR) extends the boundary to a peer device.

## 4. Assets

- Message plaintext (DMs, channels, threads, replies).
- Call and townhall media plaintext.
- Attachment plaintext.
- Deaddrop payload plaintext.
- Cross-signing master / self-signing / user-signing keys.
- Per-device Megolm/Olm keys and key backup.
- OIDC refresh tokens.
- Governance vote ballots and tally inputs.
- Federation peer keys and trust state.
- Audit logs (tamper-evident).
- User social graph and metadata (room membership, presence, who-talks-to-whom, timing).

## 5. Per-asset confidentiality / integrity / availability posture

| Asset | Confidentiality | Integrity | Availability |
|-------|-----------------|-----------|--------------|
| Message plaintext | E2EE (Megolm) | Megolm AEAD + Matrix event sigs | Best-effort across federation |
| Call/townhall media | **TLS-only today**; SFrame E2EE planned (A1) | DTLS + planned SFrame | SFU HA |
| Attachments | E2EE (Matrix file encryption) | AES-GCM AEAD | Media repo HA |
| Deaddrops | E2EE (X25519+AES-GCM; PQ hybrid planned A3) | AES-GCM AEAD | Server-opaque storage |
| Cross-signing keys | SSSS (passphrase/recovery key) | Self-signed | User-managed |
| OIDC tokens | TLS + secure storage | OIDC sigs | IdP HA |
| Governance ballots | Tamper-evident ledger | Hash chain + sigs | HA |
| Federation peer keys | TLS | Server signing keys | Perspective key servers |
| Audit logs | Operator only | WORM | HA |
| Metadata (graph/timing) | **Visible to homeserver(s)** by Matrix protocol design | n/a | n/a |

## 6. Linked narrow threat models

- Governance: `docs/blackout-governance-threat-model.md`
- Townhall / SFU: `docs/security/townhall-threat-model-refresh-cadence.md`, `docs/security/townhall-security-review-signoff.md`
- Epic-level STRIDE template: `docs/security/epic_security_review.md`
- Production network exposure: `deploy/docker/production/NETWORK_SECURITY_REVIEW.md`
- Steganography (free-tier): `docs/security/free-tier-steganography-text-emoji.md`
- Element Call / SFU architecture: `docs/architecture/ELEMENT_CALL_SFU_RTC_ARCHITECTURE.md`

When you build a new feature that crosses a trust boundary or introduces a new asset, copy `docs/security/epic_security_review.md` as a starting STRIDE template and link the result here.

## 7. Accepted residual risks

These risks are known and accepted, with the rationale recorded so reviewers do not need to re-litigate them.

| ID | Risk | Rationale | Revisit when |
|----|------|-----------|--------------|
| R1 | Homeserver sees who-talks-to-whom and when | Inherent to Matrix protocol; sealed-sender-style metadata privacy is out of scope today | Sealed sender lands in upstream Matrix |
| R2 | SFU sees plaintext A/V media | Mitigated: per-call media E2EE (symmetric for 1:1/group, broadcast sender keys for townhalls) is negotiated by default in `CallProvider.tsx`. Status surfaced by `EncryptionBadge`. Operators must keep the matrixRTC-capable SDK installed. | New SFU deployment patterns |
| R3 | Megolm not post-quantum | Awaiting upstream Matrix PQ work. Deaddrop v2 hybrid wire format + HKDF combiner landed (see `docs/security/deaddrop-pq-hybrid.md`); ML-KEM-768 primitive pending a vetted dependency follow-up. | Upstream PQ Megolm draft published; ML-KEM provider wired |
| R4 | OIDC IdP compromise = identity compromise | Standard OIDC trust model; mitigated by short token TTLs and per-device keys. Native passkey scaffold (challenges, storage, clientDataJSON validation) landed; cryptographic verification deferred — see `docs/security/webauthn-passkeys.md`. | Passkey verification ships |
| R5 | Client supply chain | Mitigated by lockfile pinning, SBOM (SPDX + Docker embedded), Sigstore-keyless cosign signatures pinned to the release workflow identity, and an RFC 6962-compatible key-transparency log (`docs/security/key-transparency.md`) so clients can detect homeserver-side key substitution. Persistence + witnesses are deployment follow-ups. | KT log gets persistence + witnesses |
| R6 | Physical device seizure | Delegated to OS keystore + FDE | New mobile threat model |
| R7 | DoS via federation amplification | Rate limits + per-peer reputation; not a confidentiality risk | New federation abuse incidents |

## 8. Release-blocking criteria (summary)

A release is blocked unless:

1. No open Critical/High vulnerabilities in application code, deps, or container images.
2. Authorization test suite passes 100% for new/changed endpoints.
3. Governance integrity tests pass (anti-replay, anti-double-cast, deterministic tally).
4. Federation trust controls validated (peer auth, sig verification, key rotation).
5. Security telemetry verified in staging.
6. This document updated for any feature that crosses a trust boundary or adds a new asset.
7. Security sign-off recorded and linked to the release artifact.

(Full criteria in `docs/security/epic_security_review.md` §5.)

## 9. Reporting

Security issues: see `SECURITY.md` for disclosure process.
