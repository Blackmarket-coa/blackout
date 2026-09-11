# Blackout governance migration notes

-   Governance proposal documents now carry `schemaVersion`, `amendments`, and `auditTimeline` fields.
-   Vote and delegation docs now carry a `schemaVersion` field.
-   CRDT persistence keys are now room + document type + document id for proposal/vote/delegation/curriculum units.
-   Migration behavior in `ProposalEngine.migrate()` upgrades v1 documents to v2 safely.

> **Correction (2026-09-10).** `ProposalEngine` does not exist in any of the
> three repositories, so `ProposalEngine.migrate()` is not a thing that can
> run. Every line above describes the `_port/` fork tree, decommissioned in
> `204b6bacd` on 2026-05-05; the CRDT layer they assume is gone too — `yjs`
> is not a dependency of any package here. Kept as a record of the migration
> that was planned. See `docs/blackout-governance-completion-tracker.md` for
> the verified state of the canonical runtime.
