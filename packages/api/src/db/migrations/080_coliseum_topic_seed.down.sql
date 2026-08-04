-- Reverse of 080. Restoring the NOT NULL on news_anchor would fail for any
-- topic proposed as text, media, or a challenge — those have no article — so
-- drop the rows' seed columns and leave news_anchor nullable. Re-applying the
-- up migration re-derives every seed from news_anchor, and topics that only
-- ever existed as a non-link seed are not recoverable by design.
DROP INDEX IF EXISTS idx_coliseum_topics_seed_kind;
ALTER TABLE coliseum_topics DROP COLUMN IF EXISTS discussion_den_id;
ALTER TABLE coliseum_topics DROP COLUMN IF EXISTS seed;
