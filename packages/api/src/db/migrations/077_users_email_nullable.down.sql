-- Reverting requires every user to have an email again. Emailless accounts
-- (email IS NULL) would violate NOT NULL, and inventing placeholder addresses
-- would corrupt real accounts — so this intentionally fails while any NULL
-- rows exist; resolve or delete those accounts first.
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
