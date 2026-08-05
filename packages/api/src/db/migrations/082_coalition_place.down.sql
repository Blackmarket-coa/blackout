-- Reverse of 082. Dropping the columns takes needs, projects and resources
-- back off the map; the records themselves are untouched and still reachable
-- from the tool bag, which is where they lived before they had coordinates.
-- `coalition_resources.location` was never involved and is unaffected.

ALTER TABLE coalition_needs DROP COLUMN IF EXISTS place;
ALTER TABLE coalition_projects DROP COLUMN IF EXISTS place;
ALTER TABLE coalition_resources DROP COLUMN IF EXISTS place;
