# Blackout governance migration notes

- Governance proposal documents now carry `schemaVersion`, `amendments`, and `auditTimeline` fields.
- Vote and delegation docs now carry a `schemaVersion` field.
- CRDT persistence keys are now room + document type + document id for proposal/vote/delegation/curriculum units.
- Migration behavior in `ProposalEngine.migrate()` upgrades v1 documents to v2 safely.
