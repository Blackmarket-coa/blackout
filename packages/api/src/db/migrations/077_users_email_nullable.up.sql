-- Make users.email nullable so emailless accounts can coexist. The Matrix
-- token-exchange / account-number flows provision Blackout rows without an
-- email, which the file store recorded as ''. Postgres UNIQUE does not exempt
-- empty strings (unlike NULL), so importing a file-mode store.json with more
-- than one emailless user collides on users_email_key after the first row.
-- NULLs ARE exempt from UNIQUE, so emailless users store email = NULL and the
-- constraint keeps enforcing uniqueness for real addresses.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
-- Normalize any already-written empty-string email (e.g. the single '' row a
-- partial import managed to insert, or rows written by the live store before
-- it coerced '' to NULL). At most one such row can exist under users_email_key.
UPDATE users SET email = NULL WHERE email = '';
