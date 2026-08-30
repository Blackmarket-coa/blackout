-- W4 (decision D7): source attribution for the reputation event log.
--
-- reputation_events is the governance-context reputation log — append-only,
-- per-subject, transfer-prohibited. What it could not answer before this
-- migration is "who caused this award": the acting party survived only
-- inside caller-composed dedupe keys (e.g. `endorse:<voterId>:<argumentId>`),
-- recoverable only by string-parsing. `actor` names who/what triggered the
-- event (a user id, or a system actor like `coliseum:verdict`); `detail` is
-- the free-form JSONB audit payload, mirroring subscription_audit_events'
-- shape. Both nullable — historical rows stay valid.

ALTER TABLE reputation_events ADD COLUMN IF NOT EXISTS actor TEXT;
ALTER TABLE reputation_events ADD COLUMN IF NOT EXISTS detail JSONB;
