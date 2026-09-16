-- The rate a tip's split was computed at, in basis points.
--
-- The split is frozen on the tip at creation, but the rate that produced it was
-- not recorded, so nothing downstream could recompute the split against a
-- different gross. That matters now that a capture can arrive for an amount the
-- tip did not predict: without the rate, reconciling means guessing it back out
-- of feeCents/grossCents, which rounds badly on small tips.
--
-- Nullable and backfilled to the flat 300 bps every existing row was charged at.
ALTER TABLE tips ADD COLUMN IF NOT EXISTS fee_bps INTEGER;
UPDATE tips SET fee_bps = 300 WHERE fee_bps IS NULL;
