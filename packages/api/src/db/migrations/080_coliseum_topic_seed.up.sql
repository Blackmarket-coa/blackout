-- Topic seeds: a Coliseum topic can now be proposed in any of four forms
-- (text / link / media / challenge) rather than only as a news-anchored debate.
--
-- `news_anchor` was NOT NULL, which is what forced every topic through the
-- article-with-a-headline shape and left Matches and Shouts to reimplement
-- "here is a thing to argue about" as separate root entities. The column stays
-- (readers built before seeds still consume it, and dropping it would be a
-- breaking read change) but is now nullable and derived from a link seed.
--
-- `discussion_den_id` is the canopy den backing a topic's free-form comments,
-- created lazily on first use. Deliberately distinct from `den_id`, which
-- records which den the topic was posted in and is only ever a scope filter.
--
-- JSONB for the seed object, TEXT ids, no cross-table FKs — matching the
-- string-keyed write-through store, as in 070_coliseum_matches. Column names
-- are camelToSnake of ColiseumTopic, so pgDescriptors needs no override.
ALTER TABLE coliseum_topics ADD COLUMN IF NOT EXISTS seed JSONB;
ALTER TABLE coliseum_topics ADD COLUMN IF NOT EXISTS discussion_den_id TEXT;
ALTER TABLE coliseum_topics ALTER COLUMN news_anchor DROP NOT NULL;

-- Every pre-existing row is a link-seeded topic by construction, so this
-- backfill is total: after it runs, no row has a NULL seed.
UPDATE coliseum_topics
   SET seed = jsonb_strip_nulls(
       jsonb_build_object(
           'kind', 'link',
           'sourceUrl', news_anchor ->> 'sourceUrl',
           'headline', news_anchor ->> 'headline',
           'publishedAt', news_anchor ->> 'publishedAt',
           'opengraphImage', news_anchor ->> 'opengraphImage'
       )
   )
 WHERE seed IS NULL
   AND news_anchor IS NOT NULL;

-- Anything left (there should be none) is a topic with no article behind it.
UPDATE coliseum_topics
   SET seed = jsonb_build_object('kind', 'text')
 WHERE seed IS NULL;

ALTER TABLE coliseum_topics ALTER COLUMN seed SET NOT NULL;

-- The feed filters and ranks by seed kind, so index the discriminator.
CREATE INDEX IF NOT EXISTS idx_coliseum_topics_seed_kind ON coliseum_topics ((seed ->> 'kind'));
