-- Event logistics: volunteer slots + signups and ride offers + seat claims,
-- attached to coalition_events. Persisted via the write-through store. All
-- upsert-only (withdraw/close toggle a status/active flag — no deletes). TEXT
-- ids, no cross-table FKs; columns mirror VolunteerSlot/VolunteerSignup/
-- RideOffer/RideClaim in @blackout/core.

CREATE TABLE event_volunteer_slots (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  role TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  status VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_event_volunteer_slots_event ON event_volunteer_slots (event_id);

CREATE TABLE event_volunteer_signups (
  id TEXT PRIMARY KEY,
  slot_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (slot_id, user_id)
);
CREATE INDEX idx_event_volunteer_signups_event ON event_volunteer_signups (event_id);

CREATE TABLE event_ride_offers (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  driver_id TEXT NOT NULL,
  origin_label TEXT NOT NULL,
  depart_at TIMESTAMPTZ,
  seats_total INTEGER NOT NULL,
  notes TEXT,
  status VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_event_ride_offers_event ON event_ride_offers (event_id);

CREATE TABLE event_ride_claims (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  rider_id TEXT NOT NULL,
  active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (offer_id, rider_id)
);
CREATE INDEX idx_event_ride_claims_event ON event_ride_claims (event_id);
