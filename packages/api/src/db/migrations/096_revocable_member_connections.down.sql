-- Restoring NOT NULL would fail against any revoked row, so the credential-less
-- rows are removed first. They carry no secret and no longer authorize
-- anything; a member who wants to post again links afresh.
DELETE FROM coalition_member_connections WHERE credential_ref IS NULL;
ALTER TABLE coalition_member_connections ALTER COLUMN credential_ref SET NOT NULL;
