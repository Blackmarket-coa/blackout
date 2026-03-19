# Feature documentation

The idea of this folder is to document the features we support in different parts of the app.
In case anyone needs to work on a given part, and isn't aware of all the features in the area,
they will hopefully get an idea for all the supported functionality to know what to take into account
when making changes.

For a repository-wide code analysis that maps bootstrap, core client, and steganography architecture, see `docs/repository_functionality_analysis.md`.

For governance-focused analysis (entitlements, boost policies, paid-room key governance, and plugin permissions), see `docs/features/governance_features_analysis.md`.

## Blackout reuse tracker highlights

The reuse tracker currently marks:

- ✅ Complete: governance lifecycle/voting, delegation semantics, education module, mutual-aid board, and sortition.
- ✅ Complete: deliberation scale/perf hardening, IPFS room-event/state UX integration, cross-module E2E depth, and rollout hardening.

See `docs/blackout-reuse-completion-tracker.md` for the detailed evidence and execution order.

## Additional feature planning docs

- `discord_parity_blueprint.md`: Matrix-first parity blueprint mapping Discord UX to Blackout equivalents, status, architecture, and phased roadmap.
- `privacy_first_stego_roadmap.md`: roadmap for privacy-first steganographic messaging.
- `privacy-first-phase0/`: concrete Phase 0 foundation artifacts (ADRs, data classification, requirements, legal playbook).
- `privacy-first-phase2/`: Phase 2 client-only steganography toolkit completion evidence (security exit criteria, telemetry proof, test inventory).
- `privacy-first-phase3/`: Phase 3 entitlement and subscription capability artifacts (billing/token boundaries, content-blind audits, server safety invariants).
- `privacy-first-phase4/`: Phase 4 federation boost primitives (tier policy, throttling, revenue-share accounting, dashboard snapshots).
- `privacy-first-phase5/`: Phase 5 paid encrypted room creator-key lifecycle artifacts (payment-gated grants, device binding, rotation/revocation, private discovery defaults).
- `privacy-first-phase6/`: Phase 6 plugin sandbox and cosmetic marketplace safety artifacts (capability manifests, explicit/revocable permissions, network/exfiltration conformance tests).
- `epic_name_delivery_blueprint.md`: EPIC implementation scaffold covering technical design, schema evolution, UI/UX, testing, telemetry, feature flags, and migration notes.
- `epic_open_source_options.md`: vetted open-source implementation options for EPIC feature flags, policy enforcement, telemetry, schema validation, and Matrix compatibility testing.
- `feature_to_open_source_map.md`: direct mapping from `feature_registry.json` feature IDs to suggested open-source equivalents and adoption guidance.

- `../blackout-rollout-runbook.md`: rollout hardening checklist for operations, localization readiness, and policy tuning.
