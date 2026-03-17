# Evidence — 2026-03-16 Sprint D closure (top-10 P2 + self-healing + townhall mitigations)

Date: 2026-03-16
Branch: `work`
Verifier: Codex (GPT-5.2-Codex)

## Scope

1. Close the regenerated top-10 P2 marker queue.
2. Extend self-healing beyond thin-slice follow-ons:
   - replay/dup integration coverage,
   - encrypted payload envelopes (X25519-derived key material + AES-GCM).
3. Operationalize Townhall post-phase mitigations with explicit cadence + role-policy contract validation.

## Implemented artifacts

### Top-10 P2 marker closures

- `_port/src/components/structures/LegacyCallEventGrouper.ts`
- `_port/src/components/structures/LoggedInView.tsx`
- `_port/src/components/structures/RoomSearchView.tsx`
- `_port/src/components/views/auth/InteractiveAuthEntryComponents.tsx`
- `_port/src/components/views/beacon/RoomCallBanner.tsx`
- `_port/src/components/views/dialogs/ModalWidgetDialog.tsx`
- `_port/src/components/views/dialogs/spotlight/SpotlightDialog.tsx`
- `_port/src/components/views/elements/AppTile.tsx`
- `_port/src/components/views/elements/RoomAliasField.tsx`
- `_port/src/components/views/messages/MFileBody.tsx`

### Self-healing follow-on implementation

- `_port/src/services/self-healing/EncryptedPayloadEnvelope.ts`
- `_port/test/services/self-healing/EncryptedPayloadEnvelope-test.ts`
- `_port/test/services/self-healing/SelfHealingReplayIntegration-test.ts`

### Townhall mitigation operationalization

- `_port/test/services/townhall/TownhallPolicyService-test.ts`
- `docs/security/townhall-threat-model-refresh-cadence.md`
- `docs/security/townhall-security-review-signoff.md`

## Validation commands

- `pnpm test`
- `pnpm lint`
- `pnpm build`
- `node _port/scripts/operations/docs_integrity_check.cjs`
- `rg -n "FIXME|TODO" _port/src/components/structures/LegacyCallEventGrouper.ts _port/src/components/structures/LoggedInView.tsx _port/src/components/structures/RoomSearchView.tsx _port/src/components/views/auth/InteractiveAuthEntryComponents.tsx _port/src/components/views/beacon/RoomCallBanner.tsx _port/src/components/views/dialogs/ModalWidgetDialog.tsx _port/src/components/views/dialogs/spotlight/SpotlightDialog.tsx _port/src/components/views/elements/AppTile.tsx _port/src/components/views/elements/RoomAliasField.tsx _port/src/components/views/messages/MFileBody.tsx`

## Outcome

- Open unfinished marker backlog reduced from **39** to **29**.
- Regenerated top-10 queue closed and replaced with the next ranked queue.
- Self-healing follow-on items from the thin-slice doc are now implemented and test-covered.
- Townhall post-phase mitigations are now attached to an explicit operational cadence and contract-test set.
