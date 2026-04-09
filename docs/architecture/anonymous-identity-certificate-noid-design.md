# Anonymous Identity System Design: Certificate Authentication + No-Identifier Accounts

## 1) Goals and non-goals

### Goals
- Enable account creation and authentication without requiring persistent personal identifiers (no phone number, no email, no legal name).
- Preserve strong account continuity with cryptographic credentials.
- Limit abuse at signup, messaging, and federation boundaries without deanonymizing users by default.
- Provide practical recovery paths that do not rely on traditional identifier-based account recovery.
- Support policy, safety, and lawful process handling with minimal data retention.

### Non-goals
- Perfect Sybil resistance without any friction.
- Absolute legal immunity across all jurisdictions.
- Recovery methods that are both zero-knowledge and fully operator-assisted in every edge case.

---

## 2) Trust and threat model

### Actors
- **Client device**: generates and stores user private keys in secure hardware when available.
- **Certificate Authority (CA) service**: issues short-lived auth certificates to pseudonymous public keys.
- **Policy/abuse service**: computes risk scores and applies rate limits and capability constraints.
- **Application backend**: verifies certificates and authorization claims.

### Main threats
- Credential theft and replay.
- Mass account creation (Sybil) for spam/harassment.
- Correlation attacks via network metadata, behavioral fingerprints, or certificate issuance timing.
- Coercive/legal demands for user identification.

### Privacy assumptions
- Server can see IP and timing unless additional network privacy controls are deployed.
- User anonymity is **pseudonymity by default**, not guaranteed untraceability.

---

## 3) Identity architecture

## 3.1 Key entities
- **Root account keypair (AK)**: long-term signing key generated client-side at account bootstrap.
- **Device keypair (DK)**: per-device key bound to AK.
- **Session keypair (SK)**: short-lived key used for active login sessions.
- **Anonymous account handle (AAH)**: random opaque account ID (for example, `acc_7f...`), never user-chosen and not human-meaningful.
- **Anonymous credential certificate (ACC)**: certificate issued by CA binding SK (or DK) to AAH with expiry + policy claims.

## 3.2 Authentication flow (high level)
1. Device creates AK and DK locally.
2. Client requests account bootstrap with DK public key and anti-abuse proof bundle.
3. Backend creates AAH and returns a one-time enrollment token.
4. Client proves possession of DK; CA issues first ACC.
5. On login/refresh, client rotates SK and gets a short-lived ACC (for example 15-60 minutes).
6. APIs accept only valid ACC + proof-of-possession signature.

## 3.3 Certificate profile
- Subject: opaque account handle (AAH).
- SAN/custom extension: device ID hash, capability tier, abuse risk tier, issuance cohort.
- Lifetime: short-lived, narrow scope, audience-bound.
- Revocation: soft via deny lists + hard via rapid expiry and rotating issuer keys.

---

## 4) Key lifecycle

## 4.1 Generation
- AK and DK are generated on-device with modern curves (Ed25519/P-256) and hardware-backed storage where possible.
- SK is generated per session and discarded on logout/expiry.

## 4.2 Storage
- AK private key: secure enclave/keystore preferred; encrypted export disabled by default.
- DK private key: device keystore, app sandbox, non-exportable if supported.
- Server stores only public keys and certificate metadata.

## 4.3 Rotation
- **Session rotation**: every refresh or at most every hour.
- **Device rotation**: when app reinstall or explicit key hygiene event.
- **Account/root rotation**: rare, recovery-triggered, requires threshold proof (see recovery section).

## 4.4 Revocation and suspension
- Immediate suspension by marking AAH as blocked in policy service (effective at next certificate check).
- Emergency revocation list for compromised DK fingerprints.
- Issuer-key rollover playbook with dual-sign window to prevent lockout.

## 4.5 Deletion
- User-requested deletion removes mapping tables and encrypted recovery envelopes after hold period.
- Retain minimal abuse/security logs with strict TTL and legal basis documentation.

---

## 5) Recovery options (no identifier required)

Use multiple options simultaneously; let users opt in based on threat model.

## 5.1 Recovery pack (offline secret shares)
- During onboarding, app generates a high-entropy recovery secret.
- Secret is split via threshold scheme (for example 2-of-3 or 3-of-5) into printable/exportable shares.
- Shares can be stored physically or with trusted contacts.
- Recovery process rebinds a new DK to existing AAH after threshold proof.

**Tradeoff:** strongest privacy, but higher user burden and share-loss risk.

## 5.2 Trusted device quorum
- User enrolls 2+ existing devices.
- New device can be approved by signatures from quorum of already-trusted devices.

**Tradeoff:** good UX for multi-device users; weak for single-device users.

## 5.3 Hardware security key escrow (user-held)
- User binds FIDO2/WebAuthn authenticators as recovery factors.
- Server stores only public credentials and counters.

**Tradeoff:** strong phishing resistance; requires extra hardware for many users.

## 5.4 Time-locked social recovery
- Designated trustees receive encrypted approval tokens.
- Recovery completes only after quorum + delay window (for example 72 hours) to allow cancellation from an existing device.

**Tradeoff:** resilient against immediate hijack, slower for legitimate recovery.

## 5.5 No operator identity verification by default
- Helpdesk cannot reset accounts based on email/phone because none exist.
- Offer optional enterprise mode where customer-managed IdP can gate recovery outside anonymous mode.

---

## 6) Anti-abuse controls (privacy-preserving)

## 6.1 Enrollment friction layers
- Proof-of-work or device-bound attestation challenges at signup.
- Blind-signed invite tokens with per-issuer budgets.
- Rate limits by IP prefix/ASN/device attestation class with privacy-preserving bucketing.

## 6.2 Progressive capability model
- New accounts start in constrained tier (message caps, room creation limits, media limits).
- Capabilities unlock with positive behavior age, trust graph signals, and low abuse score.
- Keep policy explainable: user sees which tier they are in and broad reason categories.

## 6.3 Behavior-based detection
- Graph + velocity heuristics for spam bursts, mention floods, cross-room duplication.
- Content safety checks with hash/signature matching for known abuse payloads.
- Real-time quarantine lanes (shadow mute, delayed send, link interstitials) before hard bans.

## 6.4 Certificate-integrated policy claims
- ACC includes signed risk/capability claims so edge services can enforce without extra round-trips.
- Claims are short-lived to reduce stale decisions and simplify unblocking after appeal.

## 6.5 Abuse appeal without identity disclosure
- Signed appeal tokens tied to AAH and moderation case ID.
- Separate reviewer tooling avoids exposure to raw network metadata where feasible.

---

## 7) Legal and compliance risk notes

> Not legal advice. Final requirements vary by jurisdiction and product category.

## 7.1 Data protection (US + global)
- Even without direct identifiers, persistent pseudonymous handles and IP logs can be personal data in many regimes.
- Maintain records of processing, data minimization rationale, retention limits, and access controls.
- Conduct DPIA/PIA for high-risk abuse-monitoring and automated moderation decisions.

## 7.2 Lawful process and disclosure risk
- “No identifier” does not mean “no discoverable data.” Available data may include IP history, device fingerprints, and behavior logs.
- Publish transparent law-enforcement response policy and retention schedule.
- Separate key material from operational metadata stores to reduce blast radius.

## 7.3 Child safety and platform liability
- Anonymous systems can elevate CSAM/grooming/spam risk exposure.
- Implement robust detection, reporting workflows, escalation SLAs, and trusted-flagger intake.
- Region-specific obligations (for example age-appropriate design, harmful content reporting windows) must be mapped before launch.

## 7.4 Sanctions/export controls/abuse of service
- If monetization or paid features exist, anonymous accounts can complicate sanctions screening and fraud controls.
- Consider capability segmentation where high-risk financial features require additional checks outside baseline anonymous mode.

## 7.5 Auditing and accountability
- Keep tamper-evident moderation and key-management audit logs with strict role-based access.
- Document automated decision logic at policy level to support regulator/user challenges.

---

## 8) UX tradeoffs

## 8.1 Strengths
- Fast onboarding: no email/phone verification delays.
- Better privacy posture and reduced centralized PII breach impact.
- Credentials are portable across devices if recovery is set up well.

## 8.2 Costs
- Recovery is harder and requires user education.
- Abuse friction may be felt by legitimate new users.
- Users may misunderstand anonymity guarantees unless explicitly explained.

## 8.3 UX recommendations
- Make privacy model explicit with plain-language banners:
  - “No phone/email required.”
  - “Service still sees network activity unless privacy routing is enabled.”
- Default to a guided recovery setup immediately after account creation.
- Show capability progression (“new account limits lift over time with healthy behavior”).
- Provide transparent moderation feedback and appeal path.

---

## 9) Reference implementation blueprint (phased)

## Phase 1 (MVP)
- AK/DK/SK hierarchy, short-lived ACCs, opaque AAHs.
- Basic rate limits + capability tiers.
- One recovery option: offline recovery pack.

## Phase 2
- Trusted-device quorum recovery.
- Certificate policy claims for edge enforcement.
- Improved abuse graph signals + quarantine workflows.

## Phase 3
- Optional hardware-key recovery.
- Privacy-enhanced anti-Sybil credentials (blind tokens / zero-knowledge proof based enrollment).
- Regional policy packs for legal/compliance differences.

---

## 10) Operational checklist
- Key ceremonies and issuer rollover tested quarterly.
- Recovery success-rate and false-lockout metrics tracked.
- Abuse precision/recall measured by tier and language/region.
- Data retention and lawful-process drills run with counsel + security.
- UX comprehension tested: users can correctly explain anonymity boundaries.
