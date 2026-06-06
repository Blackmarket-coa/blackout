-- Marketplace product reviews. One per (provider, listing, author); addressed by
-- the same provider+listing pair as the marketplace detail route. Persisted via
-- the write-through store; TEXT ids / no cross-table FKs to match the
-- string-keyed store. Columns mirror ProductReview in @blackout/core.

CREATE TABLE product_reviews (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_product_reviews_listing ON product_reviews (provider_id, listing_id);
CREATE UNIQUE INDEX idx_product_reviews_author ON product_reviews (provider_id, listing_id, author_id);
