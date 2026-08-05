-- Needs, projects and resources get coordinates, so they can be map pins.
--
-- These are real-world things — a community garden, a tool library, a request
-- for compost — but they were the only coalition records with no geo at all, so
-- the map could not show them. `coalition_resources.location` looked like a
-- location but is a free-text address ("side door, ask for Ray"); you cannot
-- pin a string, and it stays exactly as it is.
--
-- One JSONB column rather than four scalar ones, because a place is a tagged
-- union and splitting it loses the tag:
--
--   {"kind":"pin","latitude":47.6,"longitude":-122.3,"label":"Elm St yard"}
--   {"kind":"area","latitude":47.6,"longitude":-122.3,"radiusMeters":5000}
--
-- A pin is an address; an area is an area of operations, where the centre is a
-- reference point and the radius is the claim. Flattened to
-- lat/long/radius columns, "radius 0" and "no radius" become the same row, and
-- an approximate centre reads as a doorstep. Shape matches CoalitionPlace in
-- @blackout/core and is validated at the API edge — `place` is camelToSnake
-- clean, so pgDescriptors needs no override and pgWriter's JSONB path handles
-- serialization.
--
-- Nullable by design: plenty of needs are genuinely placeless ("we need a
-- developer"), and a NOT NULL default would put fictional pins on the map.

ALTER TABLE coalition_needs ADD COLUMN IF NOT EXISTS place JSONB;
ALTER TABLE coalition_projects ADD COLUMN IF NOT EXISTS place JSONB;
ALTER TABLE coalition_resources ADD COLUMN IF NOT EXISTS place JSONB;
