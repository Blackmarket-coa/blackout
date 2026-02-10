# Privacy-First Stego Roadmap Completion Tracker

This tracker audits implementation evidence in the repository against the roadmap phases in `privacy_first_stego_roadmap.md`.

Status legend:
- ✅ Complete: concrete artifacts exist and phase checklist appears closed.
- 🟡 Partial: meaningful implementation exists, but roadmap workstreams/exit criteria are not fully evidenced.
- ⬜ Not evident: no concrete implementation artifact was found beyond planning/policy text.

## Phase status summary

| Phase | Status | Repository evidence | Remaining execution focus |
|---|---|---|---|
| Phase 0 — Foundations and Threat Modeling | ✅ Complete | `docs/features/privacy-first-phase0/README.md` includes all Phase 0 deliverables and a fully checked completion checklist; `docs/features/README.md` points to this directory as concrete Phase 0 artifacts. | Keep artifacts updated when invariants/threat models evolve. |
| Phase 1 — Core E2EE + Ephemerality Baseline | ✅ Complete (client stego scope) | Ephemeral lifecycle/redaction exists (`EphemeralManager`), hard expiry and payload caps are enforced in `StegoCodec`, and anti-amplification chunk caps are enforced in `CarrierTransport`; tests cover these controls. | Maintain parity with room-level Matrix policy defaults and continue lifecycle regression coverage. |
| Phase 2 — Client-Only Steganography Toolkit | ✅ Complete | Stego stack is implemented (codec, emoji/image channels, chunking, compatibility validator, detector), UI components exist, and broad unit/property tests cover round trips and corruption handling. Security exit criteria are enforced by automated tests in `Phase2SecurityExit-test.ts` (no-network-path assertions, telemetry privacy proof, encrypted-only payload verification). Completion checklist in `docs/features/privacy-first-phase2/README.md`. | Maintain test coverage as stego modules evolve; update Phase 2 docs if new stego channels are added. |
| Phase 3 — Entitlements and Subscription Capabilities | 🟡 Partial | Client-side entitlement limits and checks exist (`EntitlementManager`) with tests for tier limits and content-blind send gating. | Implement and document isolated billing/token services, server-side invariant enforcement boundaries, and auditable content-blind entitlement logs. |
| Phase 4 — Federation Boosts and Infrastructure Monetization | ⬜ Not evident | Roadmap and safety whitepaper describe boost concepts; no concrete implementation artifact was found under `docs/features/` beyond Phase 0 docs. | Implement boost tiers, revenue-share accounting, and transparent boost dashboard with protocol/rate-only enforcement boundaries. |
| Phase 5 — Paid Encrypted Rooms and Creator Keys | ⬜ Not evident | Safety whitepaper describes paid-room key concepts; no concrete implementation artifact was found under `docs/features/` beyond Phase 0 docs. | Implement key issuance/grant/revocation lifecycle and private discovery defaults with measurable SLAs. |
| Phase 6 — Plugin Ecosystem and Cosmetic Marketplace | ⬜ Not evident | Safety whitepaper describes plugin marketplace constraints; no concrete implementation artifact was found under `docs/features/` beyond Phase 0 docs. | Implement sandbox runtime, capability-scoped plugin APIs, and conformance tests for exfiltration/network constraints. |

## Evidence map

### Roadmap source of truth
- Delivery phases and expectations are defined in `docs/features/privacy_first_stego_roadmap.md`.

### Phase 0 evidence
- Concrete Phase 0 artifact directory and checklist completion:
  - `docs/features/README.md`
  - `docs/features/privacy-first-phase0/README.md`

### Phase 1 evidence (ephemerality + hard safety caps)
- Implementation:
  - `src/steganography/ephemeral/EphemeralManager.ts`
  - `src/steganography/StegoCodec.ts`
  - `src/steganography/CarrierTransport.ts`
  - `src/steganography/types.ts`
  - `src/components/views/stego/StegoComposer.tsx`
- Tests:
  - `test/unit-tests/steganography/EphemeralManager-test.ts`
  - `test/unit-tests/steganography/StegoCodec-test.ts`
  - `test/unit-tests/steganography/CarrierTransport-test.ts`

### Phase 2 evidence (stego toolkit)
- Concrete Phase 2 artifact directory and checklist completion:
  - `docs/features/privacy-first-phase2/README.md`
- Core implementation exports and modules:
  - `src/steganography/index.ts`
  - `src/steganography/StegoCodec.ts`
  - `src/steganography/ImageStego.ts`
  - `src/steganography/CarrierCompatibility.ts`
  - `src/steganography/EmojiStego.ts`
  - `src/steganography/ReedSolomon.ts`
  - `src/steganography/EnvelopeV1.ts`
  - `src/steganography/EmojiValidator.ts`
  - `src/steganography/StegoDetector.ts`
  - `src/steganography/CarrierChunking.ts`
  - `src/steganography/CarrierTransport.ts`
  - `src/steganography/crc32.ts`
  - `src/steganography/types.ts`
- UI integration:
  - `src/components/views/stego/StegoComposer.tsx`
  - `src/components/views/stego/StegoMessageView.tsx`
  - `src/components/views/stego/StegoShareSheet.tsx`
- Security/exit criteria tests:
  - `test/unit-tests/steganography/Phase2SecurityExit-test.ts` — no-network assertions, telemetry privacy proof, encrypted-payload-only verification, round-trip property tests
- Tests:
  - `test/unit-tests/steganography/StegoCodec-test.ts`
  - `test/unit-tests/steganography/StegoCodecDiagnostic-test.ts`
  - `test/unit-tests/steganography/StegoCodecHardening-test.ts`
  - `test/unit-tests/steganography/ImageStego-test.ts`
  - `test/unit-tests/steganography/EmojiStego-test.ts`
  - `test/unit-tests/steganography/EmojiValidator-test.ts`
  - `test/unit-tests/steganography/ReedSolomon-test.ts`
  - `test/unit-tests/steganography/EnvelopeV1-test.ts`
  - `test/unit-tests/steganography/StegoDetector-test.ts`
  - `test/unit-tests/steganography/CarrierCompatibility-test.ts`
  - `test/unit-tests/steganography/CarrierChunking-test.ts`
  - `test/unit-tests/steganography/CarrierTransport-test.ts`
  - `test/unit-tests/steganography/CarrierTransportProperty-test.ts`
  - `test/unit-tests/steganography/crc32-test.ts`

### Phase 3 evidence (entitlements)
- Implementation:
  - `src/steganography/entitlements/EntitlementManager.ts`
- Tests:
  - `test/unit-tests/steganography/EntitlementManager-test.ts`

### Phase 4-6 planning-only evidence
- Planning/policy documents:
  - `docs/features/privacy_first_stego_roadmap.md`
  - `docs/regulator-safety-whitepaper.md`

## Suggested next execution order

1. ~~Convert remaining Phase 2 exit criteria into explicit automated checks and documentation.~~ ✅ Done.
2. Expand Phase 3 from local entitlement logic to end-to-end token/billing integration boundaries.
3. Start Phase 4 implementation with transparent, metadata-only boost accounting.
4. Sequence Phase 5 key issuance/revocation before Phase 6 plugin marketplace rollout.
