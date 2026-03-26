# Mobile Release Hardening Checklist

This checklist defines the minimum production controls for Blackout mobile distribution.

Scope:

- Android release artifacts from `blackout-mobile/android`
- iOS release artifacts from `blackout-mobile/ios`

---

## 1) Signing + keystore / certificate rotation policy

### Android

- [ ] Use a dedicated Play App Signing enrollment for production package ID.
- [ ] Keep upload keystore out of git; store in CI secret storage only.
- [ ] Restrict keystore access to release maintainers and CI service principals.
- [ ] Rotate upload key immediately on compromise and every 12 months at minimum.
- [ ] Track key alias, fingerprint (SHA-256), owner, and rotation date in internal secrets inventory.

### iOS

- [ ] Use Apple Distribution certificates tied to organization-managed Apple Developer account.
- [ ] Store App Store Connect API keys and signing material in CI secret store only.
- [ ] Rotate App Store Connect API keys every 90 days (or sooner on role changes/incidents).
- [ ] Rotate signing certificates/profiles on compromise, expiration, or maintainer offboarding.
- [ ] Keep a revocation and re-issue runbook for emergency certificate replacement.

### Rotation operations

- [ ] Maintain dual-control approval for signing key/cert creation and rotation.
- [ ] Require incident ticket + change ticket for emergency rotation.
- [ ] Verify post-rotation builds with signed test releases before cutting production.
- [ ] Archive evidence: who rotated, when, why, and validation outcomes.

---

## 2) Versioning and build-number strategy

- [ ] Use semantic versioning for app marketing version (`MAJOR.MINOR.PATCH`).
- [ ] Ensure Android `versionCode` increments monotonically for every store upload.
- [ ] Ensure iOS `CFBundleVersion` increments monotonically for every TestFlight/App Store upload.
- [ ] Tag releases in git (for example `v1.4.2`) and map tags to mobile build metadata.
- [ ] Record per-release mapping:
  - git SHA
  - app version
  - Android versionCode
  - iOS build number
  - rollout channel
- [ ] Block release if build number/version collisions are detected.

---

## 3) Store metadata and release channel process

### Store metadata baseline

- [ ] App name, subtitle/short description, and long description approved by Product + Legal.
- [ ] Privacy policy URL and support URL verified and reachable.
- [ ] Data safety / privacy nutrition labels reviewed against latest app behavior.
- [ ] Screenshots and preview assets updated for current UI and major feature set.
- [ ] Age rating / content declarations reviewed per release.
- [ ] Export/compliance declarations updated (encryption, restricted regions, etc.).

### Release channels

- [ ] Define channels: `internal`, `beta`, `production`.
- [ ] Define promotion gates:
  - internal -> beta: smoke + crash-free baseline + security checks
  - beta -> production: error budget + incident review + release approval
- [ ] Keep rollback policy per channel with owner and SLA.
- [ ] Record rollout percentages and halt criteria (crash spike, auth failure spike, push delivery degradation).

---

## 4) Pre-release operational checks

- [ ] Confirm `blackout-mobile` preflight and platform sync pass in CI.
- [ ] Verify push notification registration and delivery for Android + iOS.
- [ ] Verify deep-link routing for in-server and cross-server room targets.
- [ ] Verify auth/session restore and resume-sync behavior.
- [ ] Verify crash reporting + release health dashboards are receiving new build identifiers.

---

## 5) Release evidence package (required for every production push)

- [ ] Signed artifact provenance (build run URL + commit SHA + signer identity).
- [ ] Security scan summary and dependency diff.
- [ ] QA sign-off for target release channel.
- [ ] Product release approval.
- [ ] Rollout plan and rollback plan.
- [ ] Post-release monitoring owner and on-call contact.

---

## 6) Ownership and cadence

- [ ] Assign a Mobile Release Owner (primary) and Backup Owner.
- [ ] Review this checklist monthly and after every Sev-1/Sev-2 mobile incident.
- [ ] Treat this document as release-gating policy; missing required checks block production release.
