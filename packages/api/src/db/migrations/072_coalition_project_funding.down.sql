DROP TABLE IF EXISTS coalition_project_supports;
ALTER TABLE coalition_projects
  DROP COLUMN IF EXISTS funding_goal_cents,
  DROP COLUMN IF EXISTS raised_cents,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS supporter_count,
  DROP COLUMN IF EXISTS use_of_funds,
  DROP COLUMN IF EXISTS deadline_at,
  DROP COLUMN IF EXISTS milestones;
